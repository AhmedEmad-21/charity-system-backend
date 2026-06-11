const mongoose = require('mongoose');

const recipientItemQuotaSchema = new mongoose.Schema(
  {
    recipientUserID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    inventoryID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Inventory',
      required: true,
      index: true,
    },
    pastMonthlyTotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    monthlyLimit: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

recipientItemQuotaSchema.index({ recipientUserID: 1, inventoryID: 1 }, { unique: true });

module.exports = mongoose.model('RecipientItemQuota', recipientItemQuotaSchema);
