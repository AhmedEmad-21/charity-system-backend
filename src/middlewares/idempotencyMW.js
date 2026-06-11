const crypto = require('crypto');
const IdempotencyKey = require('../models/idempotencyKeyModel');
const { ConflictError } = require('../errors/appErrors');

// 🔐 MILESTONE 1: Idempotency Middleware
// Intercepts requests with Idempotency-Key header
// Returns cached response on retry, prevents duplicate execution

const generateRequestHash = (body = {}) => {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(body))
    .digest('hex');
};

module.exports = async function idempotencyMW(req, res, next) {
  // Only for idempotent operations that matter: POST, PUT, PATCH, DELETE
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }

  const idempotencyKey = req.headers['idempotency-key'];

  // If no key provided, proceed normally (will be slower on retry but still safe)
  if (!idempotencyKey) {
    return next();
  }

  if (!req.user) {
    return next();
  }

  try {
    const requestHash = generateRequestHash(req.body);
    const userID = req.user._id || req.user.id;

    // Look up existing idempotency key
    const existing = await IdempotencyKey.findOne({
      idempotencyKey,
      userID,
      endpoint: req.path,
      method: req.method,
    });

    if (existing) {
      // Increment attempt counter
      existing.attempts += 1;
      existing.lastAttemptAt = new Date();

      // Hash mismatch = different request payload
      if (existing.requestHash !== requestHash) {
        await existing.save();
        throw new ConflictError(
          'Idempotency key reused with different request body',
          {
            code: 'IDEMPOTENCY_KEY_MISMATCH',
            suggestion: 'Use a different Idempotency-Key for different requests',
          }
        );
      }

      // Request in progress
      if (existing.status === 'pending') {
        throw new ConflictError(
          'Request with this Idempotency-Key is already processing',
          {
            code: 'IDEMPOTENCY_KEY_IN_PROGRESS',
            suggestion: 'Wait for the first request to complete',
          }
        );
      }

      // Return cached response (success or error)
      const savedResponse = existing.responseData;
      const savedError = existing.errorData;

      await existing.save();

      if (existing.status === 'failed' && savedError) {
        res.statusCode = savedError.statusCode || 500;
        return res.json({
          success: false,
          payload: {
            message: savedError.message,
            code: savedError.code,
            details: savedError.details,
          },
          idempotent: true, // Mark as cached response
        });
      }

      // Success case: return cached response
      res.statusCode = savedResponse.statusCode || 200;
      return res.json({
        ...savedResponse.payload,
        idempotent: true, // Mark as cached response
      });
    }

    // First time seeing this key: create entry and mark as processing
    const newEntry = new IdempotencyKey({
      idempotencyKey,
      userID,
      endpoint: req.path,
      method: req.method,
      requestHash,
      status: 'pending',
    });

    await newEntry.save();
    req.idempotencyKeyRecord = newEntry;

    // Hook into response to save result
    const originalSend = res.send;
    res.send = function (data) {
      // Save response before sending
      saveIdempotencyResponse(newEntry._id, res.statusCode, data).catch((err) => {
        console.error('[IdempotencyMW] Failed to cache response:', err.message);
      });

      return originalSend.call(this, data);
    };

    // Also hook json() for JSON responses
    const originalJson = res.json;
    res.json = function (data) {
      // Save response before sending
      saveIdempotencyResponse(newEntry._id, res.statusCode, data).catch((err) => {
        console.error('[IdempotencyMW] Failed to cache response:', err.message);
      });

      return originalJson.call(this, data);
    };

    next();
  } catch (err) {
    next(err);
  }
};

// Helper: Save idempotency response after request completes
async function saveIdempotencyResponse(idempotencyKeyId, statusCode, responseData) {
  const isSuccess = statusCode < 400;
  const status = isSuccess ? 'completed' : 'failed';

  const updateData = {
    status,
    lastAttemptAt: new Date(),
  };

  if (isSuccess) {
    updateData.responseData = {
      statusCode,
      payload: responseData,
    };
  } else {
    updateData.errorData = {
      statusCode,
      message: responseData?.payload?.message || 'Unknown error',
      code: responseData?.payload?.code || 'ERROR',
      details: responseData?.payload?.details || null,
    };
  }

  await IdempotencyKey.findByIdAndUpdate(idempotencyKeyId, updateData);
}
