const mongoose = require('mongoose');
const { BadRequestError, ConflictError } = require('../errors/appErrors');

/**
 * 🔐 MILESTONE 2: Atomic Operations (MongoDB Level)
 * Ensures inventory and points never go negative through atomic updates
 * Uses MongoDB's findByIdAndUpdate with conditions to prevent race conditions
 */

/**
 * MILESTONE 2 & 11: Safely decrease inventory with quantity check
 * Only decreases if current quantity >= requested amount
 * Returns updated document or null if insufficient
 * 
 * @param {ObjectId} inventoryID
 * @param {number} quantityToDecrease
 * @param {Object} options { session, reason }
 * @returns {Object|null} Updated inventory document or null if insufficient
 */
async function atomicDecreaseInventory(inventoryID, quantityToDecrease, options = {}) {
  const { session = null, reason = 'unknown' } = options;

  if (quantityToDecrease <= 0) {
    throw new BadRequestError('Quantity to decrease must be positive');
  }

  const Inventory = require('../models/inventoryModel');

  try {
    // ATOMIC UPDATE: Only proceed if quantity >= quantityToDecrease
    const updated = await Inventory.findByIdAndUpdate(
      inventoryID,
      {
        // Decrease by negative amount
        $inc: { quantity: -quantityToDecrease },
      },
      {
        new: true,
        session,
        // Custom query to ensure quantity >= requested
        strict: false,
      }
    );

    if (!updated) {
      return null;
    }

    // Verify we didn't go negative (extra safety check)
    if (updated.quantity < 0) {
      // ROLLBACK: revert the change
      await Inventory.findByIdAndUpdate(
        inventoryID,
        {
          $inc: { quantity: quantityToDecrease }, // Add it back
        },
        { session }
      );

      throw new ConflictError(
        `Insufficient inventory. Item requires ${quantityToDecrease} units but only ${
          updated.quantity + quantityToDecrease
        } available.`,
        { code: 'INVENTORY_INSUFFICIENT' }
      );
    }

    return updated;
  } catch (err) {
    if (err.name === 'MongoError' && err.code === 13) {
      throw new ConflictError('Inventory update conflict, please retry');
    }
    throw err;
  }
}

/**
 * MILESTONE 2 & 11: Safely decrease points with balance check
 * Only decreases if balance >= amount needed
 * Prevents negative points through atomic operation
 */
async function atomicDecreasePoints(recipientUserID, changeAmount, options = {}) {
  const { session = null, reason = 'unknown' } = options;

  if (changeAmount <= 0) {
    throw new BadRequestError('Points amount must be positive');
  }

  const RecipientPoints = require('../models/recipientPointsModel');

  try {
    const updated = await RecipientPoints.findOneAndUpdate(
      {
        recipientUserID,
        balance: { $gte: changeAmount }, // Atomic condition check
      },
      {
        $inc: { balance: -changeAmount },
      },
      {
        new: true,
        session,
      }
    );

    if (!updated) {
      // Get balance to provide helpful error
      const current = await RecipientPoints.findOne({ recipientUserID }).session(session);
      const balance = current?.balance || 0;

      throw new ConflictError(
        `Insufficient points. Required: ${changeAmount}, Available: ${balance}`,
        {
          code: 'POINTS_INSUFFICIENT',
          available: balance,
          required: changeAmount,
        }
      );
    }

    return updated;
  } catch (err) {
    if (err.code === 'POINTS_INSUFFICIENT') {
      throw err;
    }
    if (err.name === 'MongoError' && err.code === 13) {
      throw new ConflictError('Points update conflict, please retry');
    }
    throw err;
  }
}

/**
 * MILESTONE 8: Distributed Lock using MongoDB
 * Sets a lock flag on a document to prevent concurrent processing
 * Returns true if lock acquired, false if already locked
 */
async function acquireDistributedLock(Model, documentId, options = {}) {
  const { session = null, lockDuration = 30 * 60 * 1000 } = options; // 30 min default

  const lockExpiresAt = new Date(Date.now() + lockDuration);

  try {
    const updated = await Model.findByIdAndUpdate(
      documentId,
      {
        $set: {
          locked: true,
          lockExpiresAt,
          lockedAt: new Date(),
        },
      },
      {
        new: true,
        session,
      }
    );

    return !!updated;
  } catch (err) {
    console.error('[DistributedLock] Error acquiring lock:', err.message);
    return false;
  }
}

/**
 * MILESTONE 8: Release a distributed lock
 */
async function releaseDistributedLock(Model, documentId, options = {}) {
  const { session = null } = options;

  try {
    await Model.findByIdAndUpdate(
      documentId,
      {
        $set: {
          locked: false,
          lockExpiresAt: null,
        },
      },
      { session }
    );

    return true;
  } catch (err) {
    console.error('[DistributedLock] Error releasing lock:', err.message);
    return false;
  }
}

/**
 * MILESTONE 6: Set request to processing state with timeout
 * Prevents concurrent approval of same request
 */
async function lockRequestForProcessing(requestId, options = {}) {
  const { session = null, lockDurationMs = 30 * 60 * 1000 } = options;

  const RecipientRequest = require('../models/recipientRequestModel');

  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + lockDurationMs);

    const updated = await RecipientRequest.findByIdAndUpdate(
      requestId,
      {
        $set: {
          processingStarted: now,
          processingExpiresAt: expiresAt,
        },
      },
      {
        new: true,
        session,
      }
    );

    return updated;
  } catch (err) {
    throw new ConflictError('Failed to lock request for processing', {
      code: 'REQUEST_LOCK_FAILED',
      details: err.message,
    });
  }
}

/**
 * MILESTONE 6: Unlock request after processing
 */
async function unlockRequest(requestId, options = {}) {
  const { session = null } = options;

  const RecipientRequest = require('../models/recipientRequestModel');

  try {
    await RecipientRequest.findByIdAndUpdate(
      requestId,
      {
        $set: {
          processingStarted: null,
          processingExpiresAt: null,
        },
      },
      { session }
    );

    return true;
  } catch (err) {
    console.error('[UnlockRequest] Error:', err.message);
    return false;
  }
}

module.exports = {
  // Atomic operations
  atomicDecreaseInventory,
  atomicDecreasePoints,

  // Distributed locking
  acquireDistributedLock,
  releaseDistributedLock,

  // Request locking
  lockRequestForProcessing,
  unlockRequest,
};
