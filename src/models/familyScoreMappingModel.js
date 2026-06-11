const mongoose = require('mongoose');

const familyScoreMappingSchema = new mongoose.Schema(
  {
    minMembers: {
      type: Number,
      required: true,
      min: 0,
    },
    maxMembers: {
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

module.exports = mongoose.model('FamilyScoreMapping', familyScoreMappingSchema);
