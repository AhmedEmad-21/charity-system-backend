const mongoose = require('mongoose');

const recipientPrioritySchema = new mongoose.Schema(
  {
    recipientUserID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    needScore: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    familyScore: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    healthScore: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    lastAidScore: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    finalScore: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
      default: 1,
    },
    lastCalculated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

recipientPrioritySchema.index({ finalScore: -1, createdAt: 1 });

recipientPrioritySchema.pre('validate', function enforceFinalScore() {
  const computedScore =
    this.needScore * 0.4 +
    this.familyScore * 0.25 +
    this.healthScore * 0.2 +
    this.lastAidScore * 0.15;

  this.finalScore = Number(computedScore.toFixed(2));

  if (this.finalScore < 1 || this.finalScore > 10) {
    throw new Error('FinalScore must be between 1.0 and 10.0');
  }

});

module.exports = mongoose.model('RecipientPriority', recipientPrioritySchema);
