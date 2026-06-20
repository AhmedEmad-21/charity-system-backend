const mongoose = require('mongoose');

const familySchema = new mongoose.Schema(
  {
    health_sub_score: {
      type: Number,
      default: 0,
      min: 0,
    },
    score_last_calculated_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model('Family', familySchema);
