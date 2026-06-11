module.exports = {
  type: "object",
  additionalProperties: false,
  required: [
    "nationalID",
    "jobTitle",
    "monthlyIncome",
    "familyMembers",
    "healthStatus",
    "documentsURL",
  ],
  properties: {
    recipientUserID: { type: "string", pattern: "^[0-9a-fA-F]{24}$" },
    nationalID: { type: "string", pattern: "^[0-9]{14}$" },
    jobTitle: { type: "string", minLength: 1 },
    monthlyIncome: { type: "number", minimum: 0 },
    familyMembers: { type: "number", minimum: 1 },
    healthStatus: { enum: ["healthy", "temporary", "medium", "chronic"] },
    documentsURL: {
      type: "array",
      minItems: 1,
      items: { type: "string", format: "uri" },
    },
    vettingStatus: { enum: ["pending", "approved", "rejected"] },
    reviewerStaffID: { type: ["string", "null"], pattern: "^[0-9a-fA-F]{24}$" },
    reviewDate: { type: ["string", "null"] },
    notes: { type: "string" },
    createRecipientPoints: { type: "boolean" },
  },
  allOf: [
    {
      if: {
        properties: {
          createRecipientPoints: { const: true },
        },
        required: ["createRecipientPoints"],
      },
      then: {
        properties: {
          vettingStatus: { const: "approved" },
        },
        required: ["vettingStatus"],
      },
    },
  ],
};
