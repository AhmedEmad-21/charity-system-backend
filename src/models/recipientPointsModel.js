const mongoose = require('mongoose');
const User = require('./userModel');

const recipientPointsSchema = new mongoose.Schema(
  {
    recipientUserID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    currentPoints: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    monthlyAllocation: {
      type: Number,
      required: true,
      min: 0,
      default: 100,
    },
    lastResetDate: {
      type: Date,
      required: true,
      default: Date.now,
      validate: {
        validator(value) {
          return value instanceof Date && !Number.isNaN(value.getTime());
        },
        message: 'lastResetDate must be a valid ISO date',
      },
    },
  },
  {
    timestamps: true,
  }
);

recipientPointsSchema.pre('validate', async function ensureApprovedVetting() {
  const userId = this.recipientUserID;
  if (!userId) {
    return;
  }

  const user = await User.findById(userId).select('vettingStatus role').session(this.$session());
  if (!user) {
    throw new Error('Recipient user not found');
  }

  if (user.role !== 'Recipient') {
    throw new Error('RecipientPoints can only be created for users with role Recipient');
  }

  if (user.vettingStatus !== 'approved') {
    throw new Error('Recipient vettingStatus must be approved before creating RecipientPoints');
  }
});

module.exports = mongoose.model('RecipientPoints', recipientPointsSchema);
