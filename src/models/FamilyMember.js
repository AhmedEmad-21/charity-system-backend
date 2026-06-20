const mongoose = require('mongoose');

const familyMemberSchema = new mongoose.Schema(
  {
    family_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Family',
      required: true,
      index: true,
    },
    health_status: {
      type: String,
      default: null,
    },
    health_severity: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

familyMemberSchema.index({ family_id: 1, _id: 1 });

module.exports = mongoose.model('FamilyMember', familyMemberSchema);
