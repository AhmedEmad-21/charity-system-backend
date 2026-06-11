const { BadRequestError, ConflictError } = require('../errors/appErrors');

/**
 * 🔐 MILESTONE 11 & 12: Data Consistency Guards & Conflict Response Strategy
 * 
 * Prevents:
 * - Negative inventory
 * - Negative points
 * - Double processing
 * - Invalid state transitions
 * 
 * Returns clear error messages for conflict scenarios
 */

/**
 * MILESTONE 11: Guard - Ensure value never goes negative
 */
function validateNeverNegative(value, fieldName = 'value') {
  if (typeof value !== 'number') {
    throw new BadRequestError(`${fieldName} must be a number`);
  }

  if (value < 0) {
    throw new ConflictError(`${fieldName} cannot be negative`, {
      code: 'NEGATIVE_VALUE_VIOLATION',
      field: fieldName,
      value,
    });
  }

  return true;
}

/**
 * MILESTONE 11: Guard - Check if balance is sufficient
 */
function validateSufficientBalance(currentBalance, required, fieldName = 'Balance') {
  validateNeverNegative(currentBalance, fieldName);

  if (currentBalance < required) {
    throw new ConflictError(
      `Insufficient ${fieldName}. Available: ${currentBalance}, Required: ${required}`,
      {
        code: `${fieldName.toUpperCase()}_INSUFFICIENT`,
        available: currentBalance,
        required,
      }
    );
  }

  return true;
}

/**
 * MILESTONE 11: Guard - Check if inventory quantity is valid
 */
function validateInventoryQuantity(currentQuantity, requestedQuantity) {
  validateNeverNegative(currentQuantity, 'Inventory quantity');
  validateNeverNegative(requestedQuantity, 'Requested quantity');

  if (currentQuantity < requestedQuantity) {
    throw new ConflictError(
      `Item no longer available. Available: ${currentQuantity}, Requested: ${requestedQuantity}`,
      {
        code: 'INVENTORY_INSUFFICIENT',
        available: currentQuantity,
        requested: requestedQuantity,
      }
    );
  }

  return true;
}

/**
 * MILESTONE 12: Clear conflict response for inventory scenarios
 */
function buildInventoryConflictResponse(scenario, data = {}) {
  const conflictMessages = {
    ITEM_EXHAUSTED: {
      message: 'Item no longer available',
      code: 'INVENTORY_CONFLICT_ITEM_EXHAUSTED',
      suggestion: 'Choose a different item or wait for restock',
      available: data.available,
      requested: data.requested,
    },

    QUANTITY_NEGATIVE: {
      message: 'Invalid inventory state detected',
      code: 'INVENTORY_DATA_INTEGRITY_VIOLATION',
      suggestion: 'Contact support',
      details: 'Inventory quantity cannot be negative',
    },

    CONCURRENT_UPDATE: {
      message: 'Item was just acquired by another user',
      code: 'INVENTORY_CONCURRENT_CONFLICT',
      suggestion: 'Please try another item',
      conflictingUserID: data.conflictingUserID,
    },

    INSUFFICIENT_INVENTORY: {
      message: `Only ${data.available} units available, but ${data.requested} were requested`,
      code: 'INVENTORY_INSUFFICIENT',
      suggestion: 'Request fewer items or choose a different item',
      available: data.available,
      requested: data.requested,
    },
  };

  return (
    conflictMessages[scenario] || {
      message: 'Inventory conflict occurred',
      code: 'INVENTORY_CONFLICT_UNKNOWN',
      scenario,
    }
  );
}

/**
 * MILESTONE 12: Clear conflict response for points scenarios
 */
function buildPointsConflictResponse(scenario, data = {}) {
  const conflictMessages = {
    POINTS_INSUFFICIENT: {
      message: `Insufficient points. You have ${data.available} but ${data.required} are required`,
      code: 'POINTS_INSUFFICIENT',
      suggestion: 'Complete more tasks to earn points, or choose a cheaper item',
      available: data.available,
      required: data.required,
    },

    POINTS_NEGATIVE: {
      message: 'Invalid points state detected',
      code: 'POINTS_DATA_INTEGRITY_VIOLATION',
      suggestion: 'Contact support',
      details: 'Points balance cannot be negative',
    },

    CONCURRENT_DEDUCTION: {
      message: 'Your points were just deducted by another request',
      code: 'POINTS_CONCURRENT_CONFLICT',
      suggestion: 'Verify your balance and try again',
    },
  };

  return (
    conflictMessages[scenario] || {
      message: 'Points conflict occurred',
      code: 'POINTS_CONFLICT_UNKNOWN',
      scenario,
    }
  );
}

/**
 * MILESTONE 12: Clear conflict response for duplicate processing
 */
function buildDuplicateProcessingResponse(scenario, data = {}) {
  const conflictMessages = {
    REQUEST_ALREADY_PROCESSED: {
      message: 'This request has already been processed',
      code: 'REQUEST_DUPLICATE_PROCESSING',
      suggestion: 'Check your request history or create a new request',
      previousStatus: data.status,
      processedAt: data.processedAt,
    },

    IDEMPOTENCY_KEY_IN_PROGRESS: {
      message: 'A request with this Idempotency-Key is already being processed',
      code: 'REQUEST_IN_PROGRESS',
      suggestion: 'Wait for the first request to complete before retrying',
      idempotencyKey: data.idempotencyKey,
    },

    IDEMPOTENCY_KEY_MISMATCH: {
      message: 'Idempotency key was reused with a different request body',
      code: 'IDEMPOTENCY_KEY_MISMATCH',
      suggestion: 'Use the same request body with this Idempotency-Key, or use a new key',
    },

    PAYMENT_ALREADY_COMPLETED: {
      message: 'This payment has already been completed',
      code: 'PAYMENT_ALREADY_PROCESSED',
      suggestion: 'Check your transaction history',
      previousTransactionID: data.transactionID,
      previousAmount: data.amount,
    },
  };

  return (
    conflictMessages[scenario] || {
      message: 'Duplicate processing detected',
      code: 'DUPLICATE_PROCESSING_UNKNOWN',
      scenario,
    }
  );
}

/**
 * MILESTONE 12: Clear conflict response for system failures
 */
function buildSystemConflictResponse(scenario, data = {}) {
  const conflictMessages = {
    TRANSACTION_FAILED: {
      message: 'Database transaction failed. Please retry your request',
      code: 'TRANSACTION_FAILED',
      suggestion: 'Try again in a few moments',
      retryable: true,
    },

    LOCK_TIMEOUT: {
      message: 'Request processing took too long. Please retry',
      code: 'LOCK_TIMEOUT',
      suggestion: 'Try again with a fresh request',
      retryable: true,
    },

    ALLOCATION_IN_PROGRESS: {
      message: 'Smart allocation is currently running. Please try again in a moment',
      code: 'SYSTEM_JOB_IN_PROGRESS',
      suggestion: 'Wait for the current allocation to complete',
      retryable: true,
    },
  };

  return (
    conflictMessages[scenario] || {
      message: 'System conflict occurred',
      code: 'SYSTEM_CONFLICT_UNKNOWN',
      scenario,
    }
  );
}

/**
 * MILESTONE 12: Unified buildConflictResponse function
 * Routes to appropriate conflict response builder
 */
function buildConflictResponse(type, scenario, data = {}) {
  const builders = {
    INVENTORY: buildInventoryConflictResponse,
    POINTS: buildPointsConflictResponse,
    DUPLICATE: buildDuplicateProcessingResponse,
    SYSTEM: buildSystemConflictResponse,
  };

  const builder = builders[type];
  if (!builder) {
    return {
      message: 'Conflict occurred',
      code: 'CONFLICT_UNKNOWN',
      type,
      scenario,
    };
  }

  return builder(scenario, data);
}

module.exports = {
  // Validation guards
  validateNeverNegative,
  validateSufficientBalance,
  validateInventoryQuantity,

  // Conflict response builders
  buildInventoryConflictResponse,
  buildPointsConflictResponse,
  buildDuplicateProcessingResponse,
  buildSystemConflictResponse,
  buildConflictResponse,
};
