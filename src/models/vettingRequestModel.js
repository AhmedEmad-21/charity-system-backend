const mongoose = require("mongoose");
const {
  upsertPriorityFromVettingData,
} = require("../services/priorityEngineService");

const healthStatuses = ["healthy", "temporary", "medium", "chronic"];
const vettingStatuses = ["pending", "approved", "rejected"];

const vettingRequestSchema = new mongoose.Schema(
  {
    recipientUserID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    nationalID: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    jobTitle: {
      type: String,
      required: true,
      trim: true,
    },
    monthlyIncome: {
      type: Number,
      required: true,
      min: 0,
    },
    familyMembers: {
      type: Number,
      required: true,
      min: 1,
    },
    healthStatus: {
      type: String,
      required: true,
      enum: healthStatuses,
    },
    documentsURL: {
      type: [String],
      required: true,
      validate: {
        validator(value) {
          return Array.isArray(value) && value.length > 0;
        },
        message: "At least one document URL is required",
      },
    },
    requestDate: {
      type: Date,
      default: Date.now,
    },
    vettingStatus: {
      type: String,
      enum: vettingStatuses,
      default: "pending",
    },
    reviewerStaffID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewDate: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

vettingRequestSchema.index({
  recipientUserID: 1,
  vettingStatus: 1,
  requestDate: -1,
});
vettingRequestSchema.index({ vettingStatus: 1, requestDate: -1 });
vettingRequestSchema.index({ requestDate: -1 });

vettingRequestSchema.post("save", async function syncPriorityOnSave() {
  if (this.vettingStatus !== "approved") {
    return;
  }

  await upsertPriorityFromVettingData({
    recipientUserID: this.recipientUserID,
    monthlyIncome: this.monthlyIncome,
    familyMembers: this.familyMembers,
    healthStatus: this.healthStatus,
  });
});

vettingRequestSchema.post(
  "findOneAndUpdate",
  async function syncPriorityOnUpdate(doc) {
    if (!doc || doc.vettingStatus !== "approved") {
      return;
    }

    await upsertPriorityFromVettingData({
      recipientUserID: doc.recipientUserID,
      monthlyIncome: doc.monthlyIncome,
      familyMembers: doc.familyMembers,
      healthStatus: doc.healthStatus,
    });
  },
);

module.exports = mongoose.model("VettingRequest", vettingRequestSchema);
