const mongoose = require('mongoose');

// 🔐 MILESTONE 1: Idempotency System
// Prevents duplicate processing of recurring requests (e.g., double-click)
// Stores: idempotency-key + response + timestamp for retry scenarios

const idempotencyKeySchema = new mongoose.Schema(
  {
    // Unique key from client (usually UUID)
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    // User who initiated the request
    userID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // API endpoint (POST /transactions, POST /recipient/request, etc.)
    endpoint: {
      type: String,
      required: true,
      index: true,
    },

    // HTTP method
    method: {
      type: String,
      enum: ['POST', 'PUT', 'PATCH', 'DELETE'],
      required: true,
    },

    // Request payload hash (for validation)
    requestHash: {
      type: String,
      required: true,
    },

    // Status of the idempotent operation
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },

    // Cached response (what to return on retry)
    responseData: {
      statusCode: {
        type: Number,
        default: 200,
      },
      payload: mongoose.Schema.Types.Mixed,
      headers: mongoose.Schema.Types.Mixed,
    },

    // Error details if operation failed
    errorData: {
      statusCode: Number,
      message: String,
      code: String,
      details: mongoose.Schema.Types.Mixed,
    },

    // Expiry: clean up old idempotency keys after 24 hours
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    },

    // Tracking
    attempts: {
      type: Number,
      default: 1,
    },
    lastAttemptAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Auto-delete expired records
idempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('IdempotencyKey', idempotencyKeySchema);
