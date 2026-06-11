const mongoose = require('mongoose');

const healthStatuses = ['healthy', 'temporary', 'medium', 'chronic'];

const healthScoreMappingSchema = new mongoose.Schema(
  {
    healthStatus: {
      type: String,
      required: true,
      unique: true,
      enum: healthStatuses,
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

module.exports = mongoose.model('HealthScoreMapping', healthScoreMappingSchema);
