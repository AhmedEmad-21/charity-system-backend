const mongoose = require('mongoose');

const pointsTransactionSchema = new mongoose.Schema(
  {
    recipientUserID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    changeAmount: {
      type: Number,
      required: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    relatedRequestID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RecipientRequest',
      default: null,
    },
    date: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

pointsTransactionSchema.index({ recipientUserID: 1, date: -1 });
pointsTransactionSchema.index({ recipientUserID: 1, createdAt: -1 });
pointsTransactionSchema.index({ relatedRequestID: 1 });

module.exports = mongoose.model('PointsTransaction', pointsTransactionSchema);
