const mongoose = require('mongoose');
const RecipientRequest = require('../models/recipientRequestModel');
const RequestedItem = require('../models/requestedItemModel');
const RecipientPoints = require('../models/recipientPointsModel');
const PointsTransaction = require('../models/pointsTransactionModel');
const SystemAuditLog = require('../models/systemAuditLogModel');
const { BadRequestError, ConflictError, NotFoundError } = require('../errors/appErrors');
const {
  atomicDecreaseInventory,
  atomicDecreasePoints,
  lockRequestForProcessing,
  unlockRequest,
} = require('./atomicOperations');
const { buildConflictResponse } = require('./dataIntegrityGuards');
const messageService = require('./messageService');

/**
 * 🔐 MILESTONE 6: Request Locking Service
 * Prevents concurrent approval of same request
 * Uses processingStarted flag with expiry
 */

/**
 * Check if request is locked by another process
 * Automatically removes expired locks
 */
async function checkAndCleanupExpiredLocks(requestId, options = {}) {
  const { session = null } = options;

  const request = await RecipientRequest.findById(requestId).session(session);

  if (!request) {
    return null;
  }

  // Check if lock expired
  if (request.processingExpiresAt && new Date() > request.processingExpiresAt) {
    // Lock expired, clean it up
    await unlockRequest(requestId, { session });
    return request;
  }

  // Still locked
  if (request.processingStarted) {
    const lockAge = new Date() - new Date(request.processingStarted);
    throw new ConflictError(
      `Request is already being processed. Lock acquired ${Math.round(lockAge / 1000)} seconds ago`,
      {
        code: 'REQUEST_PROCESSING_LOCKED',
        lockedSince: request.processingStarted,
        suggestion: 'Try again in a few moments',
        retryable: true,
      }
    );
  }

  return request;
}

/**
 * 🔐 MILESTONE 6, 11, 13: Safe approval workflow
 * Combines:
 * - Request locking (prevent double approval)
 * - Atomic point deduction
 * - Atomic inventory decrease  
 * - Audit logging
 * - Material message creation
 */
async function safeApproveRequest(requestId, approvalData, options = {}) {
  const { session: externalSession = null, staffID = null } = options;

  if (!staffID) {
    throw new BadRequestError('staffID is required for approval');
  }

  const session = externalSession || await mongoose.startSession();
  const ownsSession = !externalSession;

  try {
    if (ownsSession) {
      session.startTransaction();
    }

    // MILESTONE 6: Check for existing lock
    const request = await checkAndCleanupExpiredLocks(requestId, { session });

    if (request.status !== 'pending') {
      throw new ConflictError('Request cannot be approved in current state', {
        code: 'REQUEST_INVALID_STATUS',
        currentStatus: request.status,
        suggestion: 'Only pending requests can be approved',
      });
    }

    // MILESTONE 6: Acquire processing lock
    await lockRequestForProcessing(requestId, {
      session,
      lockDurationMs: 5 * 60 * 1000, // 5 minutes
    });

    // MILESTONE 13: Record audit - approval started
    await SystemAuditLog.create(
      [
        {
          action: 'REQUEST_APPROVAL_STARTED',
          targetModel: 'RecipientRequest',
          targetID: requestId,
          changes: {
            previousStatus: request.status,
            staffID,
            timestamp: new Date(),
          },
          performedByID: staffID,
          ipAddress: approvalData.ipAddress || 'unknown',
          timestamp: new Date(),
        },
      ],
      { session }
    );

    // Get requested items
    const requestedItems = await RequestedItem.find({ recipientRequestID: requestId })
      .populate('inventoryID')
      .session(session);

    if (!requestedItems || requestedItems.length === 0) {
      throw new BadRequestError('No items in request');
    }

    // Calculate total points cost
    let totalPointsCost = 0;
    for (const item of requestedItems) {
      if (!item.inventoryID) {
        throw new NotFoundError(`Item inventory not found: ${item._id}`);
      }

      const cost = item.inventoryID.itemPointsCost * (item.quantityRequested || 1);
      totalPointsCost += cost;
    }

    // MILESTONE 11 & 2: Atomically deduct points
    // This will throw ConflictError if insufficient points
    try {
      await atomicDecreasePoints(request.recipientUserID, totalPointsCost, {
        session,
        reason: 'recipient_request_approval',
      });
    } catch (err) {
      if (err.code === 'POINTS_INSUFFICIENT') {
        const response = buildConflictResponse('POINTS', 'POINTS_INSUFFICIENT', {
          available: err.details.available,
          required: err.details.required,
        });

        throw new ConflictError(response.message, {
          code: response.code,
          ...response,
        });
      }

      throw err;
    }

    // MILESTONE 13: Record points deduction audit
    await SystemAuditLog.create(
      [
        {
          action: 'POINTS_DEDUCTED',
          targetModel: 'RecipientPoints',
          targetID: request.recipientUserID,
          changes: {
            amount: totalPointsCost,
            reason: 'request_approval',
            requestID: requestId,
          },
          performedByID: staffID,
          ipAddress: approvalData.ipAddress || 'unknown',
          timestamp: new Date(),
        },
      ],
      { session }
    );

    // MILESTONE 2: Atomically decrease inventory for each item
    for (const item of requestedItems) {
      try {
        const quantityToDecrease = item.quantityRequested || 1;

        await atomicDecreaseInventory(item.inventoryID._id, quantityToDecrease, {
          session,
          reason: 'recipient_request_approval',
        });

        // MILESTONE 13: Audit inventory change
        await SystemAuditLog.create(
          [
            {
              action: 'INVENTORY_DECREASED',
              targetModel: 'Inventory',
              targetID: item.inventoryID._id,
              changes: {
                quantityDecreased: quantityToDecrease,
                reason: 'request_approval',
                requestID: requestId,
                itemName: item.inventoryID.itemName,
              },
              performedByID: staffID,
              ipAddress: approvalData.ipAddress || 'unknown',
              timestamp: new Date(),
            },
          ],
          { session }
        );
      } catch (err) {
        if (err.code === 'INVENTORY_INSUFFICIENT') {
          const response = buildConflictResponse('INVENTORY', 'ITEM_EXHAUSTED', {
            available: err.details?.available || 0,
            requested: err.details?.required || 1,
          });

          throw new ConflictError(response.message, {
            code: response.code,
            itemName: item.inventoryID?.itemName,
            ...response,
          });
        }

        throw err;
      }
    }

    // Create points transaction record
    await PointsTransaction.create(
      [
        {
          recipientUserID: request.recipientUserID,
          changeAmount: -totalPointsCost,
          reason: 'recipient_request_approved',
          relatedRequestID: requestId,
          date: new Date(),
        },
      ],
      { session }
    );

    // Update request status
    const updatedRequest = await RecipientRequest.findByIdAndUpdate(
      requestId,
      {
        status: 'approved',
        staffReviewerID: staffID,
        reviewedAt: new Date(),
      },
      { new: true, session }
    );

    // Create notification message
    await messageService.create(
      {
        userID: request.recipientUserID,
        messageType: 'request_approved',
        content: `Your request was approved. ${totalPointsCost} points were deducted.`,
        relatedRequestID: requestId,
      },
      { session }
    );

    // MILESTONE 6: Unlock request (success)
    await unlockRequest(requestId, { session });

    // MILESTONE 13: Final audit log
    await SystemAuditLog.create(
      [
        {
          action: 'REQUEST_APPROVED',
          targetModel: 'RecipientRequest',
          targetID: requestId,
          changes: {
            status: 'approved',
            pointsDeducted: totalPointsCost,
            itemsApproved: requestedItems.length,
            staffID,
          },
          performedByID: staffID,
          ipAddress: approvalData.ipAddress || 'unknown',
          timestamp: new Date(),
        },
      ],
      { session }
    );

    if (ownsSession) {
      await session.commitTransaction();
    }

    return updatedRequest;
  } catch (err) {
    if (ownsSession) {
      try {
        await session.abortTransaction();
      } catch (abortErr) {
        console.error('[SafeApproveRequest] Abort error:', abortErr.message);
      }

      // Try to unlock on error
      try {
        await unlockRequest(requestId, { session: null });
      } catch (unlockErr) {
        console.warn('[SafeApproveRequest] Unlock error on failure:', unlockErr.message);
      }
    }

    throw err;
  } finally {
    if (ownsSession) {
      await session.endSession();
    }
  }
}

/**
 * 🔐 MILESTONE 6, 13: Safe rejection workflow
 */
async function safeRejectRequest(requestId, rejectionData, options = {}) {
  const { session: externalSession = null, staffID = null } = options;

  if (!staffID) {
    throw new BadRequestError('staffID is required for rejection');
  }

  const session = externalSession || await mongoose.startSession();
  const ownsSession = !externalSession;

  try {
    if (ownsSession) {
      session.startTransaction();
    }

    // MILESTONE 6: Check for existing lock
    const request = await checkAndCleanupExpiredLocks(requestId, { session });

    if (request.status !== 'pending') {
      throw new ConflictError('Request cannot be rejected in current state', {
        code: 'REQUEST_INVALID_STATUS',
        currentStatus: request.status,
      });
    }

    // MILESTONE 6: Acquire processing lock
    await lockRequestForProcessing(requestId, { session });

    // MILESTONE 13: Audit rejection
    await SystemAuditLog.create(
      [
        {
          action: 'REQUEST_REJECTED',
          targetModel: 'RecipientRequest',
          targetID: requestId,
          changes: {
            status: 'rejected',
            reason: rejectionData.reason || 'No reason provided',
            staffID,
          },
          performedByID: staffID,
          ipAddress: rejectionData.ipAddress || 'unknown',
          timestamp: new Date(),
        },
      ],
      { session }
    );

    // Update request status
    const updatedRequest = await RecipientRequest.findByIdAndUpdate(
      requestId,
      {
        status: 'rejected',
        staffReviewerID: staffID,
        reviewedAt: new Date(),
        notes: rejectionData.reason || '',
      },
      { new: true, session }
    );

    // Create notification
    await messageService.create(
      {
        userID: request.recipientUserID,
        messageType: 'request_rejected',
        content: `Your request was rejected. ${rejectionData.reason || 'No reason provided'}`,
        relatedRequestID: requestId,
      },
      { session }
    );

    // MILESTONE 6: Unlock
    await unlockRequest(requestId, { session });

    if (ownsSession) {
      await session.commitTransaction();
    }

    return updatedRequest;
  } catch (err) {
    if (ownsSession) {
      try {
        await session.abortTransaction();
      } catch (abortErr) {
        console.error('[SafeRejectRequest] Abort error:', abortErr.message);
      }

      try {
        await unlockRequest(requestId, { session: null });
      } catch (unlockErr) {
        console.warn('[SafeRejectRequest] Unlock error:', unlockErr.message);
      }
    }

    throw err;
  } finally {
    if (ownsSession) {
      await session.endSession();
    }
  }
}

module.exports = {
  checkAndCleanupExpiredLocks,
  safeApproveRequest,
  safeRejectRequest,
};
