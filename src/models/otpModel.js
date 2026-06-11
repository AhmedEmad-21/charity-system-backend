const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    otpHash: {
      type: String,
      required: true,
      trim: true,
    },
    purpose: {
      type: String,
      enum: ['verify', 'reset'],
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    isUsed: {
      type: Boolean,
      default: false,
      index: true,
    },
    usedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
otpSchema.index(
  { userId: 1, purpose: 1, isUsed: 1 },
  {
    unique: true,
    partialFilterExpression: { isUsed: false },
  }
);

module.exports = mongoose.model('Otp', otpSchema);
