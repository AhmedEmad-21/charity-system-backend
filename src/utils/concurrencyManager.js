const mongoose = require("mongoose");
const RecipientRequest = require("../models/recipientRequestModel");
const RequestedItem = require("../models/requestedItemModel");
const RecipientPriority = require("../models/recipientPriorityModel");
const { ConflictError, BadRequestError } = require("../errors/appErrors");
const { formatEgyptDateTime } = require("./timezone");

/**
 * 🔐 MILESTONE 4 & 5: Priority-based Locking & Last Item Conflict Resolution
 *
 * When multiple users request the same item, we use a multi-level sorting:
 * 1. Final priority (DESC) - higher priority wins
 * 2. Request date (ASC) - earlier request wins
 * 3. Random (optional) - last resort for exact ties
 */

/**
 * MILESTONE 4: Fetch pending requests sorted by priority
 * Orders requests for fair processing
 * @returns {Array} Sorted requests by final priority DESC, then requestDate ASC
 */
async function getPendingRequestsSortedByPriority(limit = 100, options = {}) {
  const { session = null } = options;

  const pendingRequests = await RecipientRequest.find({
    status: "pending",
    processingStarted: null, // Not currently processing
  })
    .populate({
      path: "recipientUserID",
      select: "name email",
    })
    .populate({
      path: "recipientPriorityID", // If available
      select: "finalPriority",
      model: "RecipientPriority",
    })
    .session(session)
    .limit(limit)
    .sort({ requestDate: 1 });

  // Fetch priority for each request separately if not populated
  const withPriorities = await Promise.all(
    pendingRequests.map(async (req) => {
      let priority = 0;

      try {
        const recipientPriority = await RecipientPriority.findOne({
          recipientUserID: req.recipientUserID._id,
        }).session(session);

        priority = recipientPriority?.finalPriority || 0;
      } catch (err) {
        console.warn(
          `[PrioritySort] Could not fetch priority for ${req.recipientUserID._id}`,
        );
      }

      return {
        ...(req.toObject ? req.toObject() : req),
        priority,
      };
    }),
  );

  // MILESTONE 5: Multi-level sort
  // Level 1: Priority DESC
  // Level 2: Request Date ASC (first come, first served)
  // Level 3: random seed (optional, for exact ties)
  return withPriorities.sort((a, b) => {
    // Level 1: Priority DESC
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }

    // Level 2: Request Date ASC
    const aDate = new Date(a.requestDate).getTime();
    const bDate = new Date(b.requestDate).getTime();

    if (aDate !== bDate) {
      return aDate - bDate;
    }

    // Level 3: Deterministic random based on request ID for exact ties
    return a._id.toString().localeCompare(b._id.toString());
  });
}

/**
 * MILESTONE 4: Safely process requests in priority queue
 * Processes one request at a time to prevent race conditions
 * @param {Function} processorFn - Function to process each request
 * @returns {Object} Results { success: [], failed: [] }
 */
async function processPriorityQueueSafely(processorFn, options = {}) {
  const { session: externalSession = null, maxRetries = 3 } = options;

  const results = {
    success: [],
    failed: [],
  };

  try {
    const pendingRequests = await getPendingRequestsSortedByPriority(100, {
      session: externalSession,
    });

    for (const request of pendingRequests) {
      let retries = 0;

      while (retries < maxRetries) {
        const session = externalSession || (await mongoose.startSession());
        const ownsSession = !externalSession;

        try {
          if (ownsSession) {
            session.startTransaction();
          }

          // MILESTONE 4: Process one at a time
          const result = await processorFn(request, { session });

          if (ownsSession) {
            await session.commitTransaction();
          }

          results.success.push({
            requestID: request._id,
            result,
          });

          break; // Success, move to next request
        } catch (err) {
          if (ownsSession) {
            try {
              await session.abortTransaction();
            } catch (abortErr) {
              console.error("[PriorityQueue] Abort error:", abortErr.message);
            }
          }

          retries++;

          if (retries === maxRetries) {
            results.failed.push({
              requestID: request._id,
              error: err.message,
              code: err.code,
            });
          }
        } finally {
          if (ownsSession) {
            await session.endSession();
          }
        }
      }
    }

    return results;
  } catch (err) {
    throw new BadRequestError("Failed to process priority queue", {
      details: err.message,
    });
  }
}

/**
 * MILESTONE 5: Check if item is available (considering concurrent requests)
 * For last-item scenarios, we must verify actual inventory before committing
 */
async function verifyItemAvailability(
  inventoryID,
  quantityNeeded,
  options = {},
) {
  const { session = null } = options;

  const Inventory = require("../models/inventoryModel");

  const inventory = await Inventory.findById(inventoryID).session(session);

  if (!inventory) {
    throw new ConflictError("Item not found", {
      code: "ITEM_NOT_FOUND",
    });
  }

  if (inventory.quantity < quantityNeeded) {
    throw new ConflictError(
      `Item no longer available. Available: ${inventory.quantity}, Needed: ${quantityNeeded}`,
      {
        code: "ITEM_EXHAUSTED",
        available: inventory.quantity,
        needed: quantityNeeded,
      },
    );
  }

  return true;
}

/**
 * MILESTONE 4 & 5: Get conflict resolution tier
 * Help determine winner when two requests conflict
 */
function getConflictResolutionTier(request1, request2) {
  if (request1.priority !== request2.priority) {
    return {
      tier: "PRIORITY",
      winner:
        request1.priority > request2.priority ? request1._id : request2._id,
      reason: `Higher priority: ${
        request1.priority > request2.priority
          ? request1.priority
          : request2.priority
      }`,
    };
  }

  const date1 = new Date(request1.requestDate).getTime();
  const date2 = new Date(request2.requestDate).getTime();

  if (date1 !== date2) {
    return {
      tier: "TIMESTAMP",
      winner: date1 < date2 ? request1._id : request2._id,
      reason: `Earlier request: ${formatEgyptDateTime(date1 < date2 ? request1.requestDate : request2.requestDate)}`,
    };
  }

  return {
    tier: "RANDOM",
    winner:
      request1._id.toString() < request2._id.toString()
        ? request1._id
        : request2._id,
    reason: "Deterministic random selection (by ID)",
  };
}

module.exports = {
  getPendingRequestsSortedByPriority,
  processPriorityQueueSafely,
  verifyItemAvailability,
  getConflictResolutionTier,
};
