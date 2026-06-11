module.exports = {
  type: "object",
  additionalProperties: false,
  required: ["role", "name", "email", "password", "phoneNumber", "address"],
  properties: {
    role: { enum: ["Staff", "Admin"] },
    name: { type: "string", minLength: 1 },
    email: { type: "string", format: "email" },
    password: { type: "string", minLength: 8 },
    phoneNumber: { type: "string", pattern: "^01[0125][0-9]{8}$" },
    address: { type: "string", minLength: 1 },
    accountStatus: { enum: ["active", "suspended"] },
    vettingStatus: { enum: ["pending", "approved", "rejected"] },
  },
};
