const mongoose = require('mongoose');

const lastAidScoreMappingSchema = new mongoose.Schema(
  {
    minMonths: {
      type: Number,
      required: true,
      min: 0,
    },
    maxMonths: {
      type: Number,
      default: null,
      min: 0,
    },
    score: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('LastAidScoreMapping', lastAidScoreMappingSchema);
