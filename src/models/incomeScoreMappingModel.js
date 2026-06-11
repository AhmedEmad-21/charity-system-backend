const mongoose = require('mongoose');

const incomeScoreMappingSchema = new mongoose.Schema(
  {
    minIncome: {
      type: Number,
      required: true,
      min: 0,
    },
    maxIncome: {
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

module.exports = mongoose.model('IncomeScoreMapping', incomeScoreMappingSchema);
