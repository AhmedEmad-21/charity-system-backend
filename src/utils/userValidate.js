module.exports = {
	type: 'object',
	additionalProperties: false,
	required: ['role', 'name', 'email', 'passwordHash', 'phoneNumber', 'address'],
	properties: {
		role: { enum: ['Donor', 'Recipient', 'Staff', 'Admin'] },
		name: { type: 'string', minLength: 1 },
		email: { type: 'string', format: 'email' },
		passwordHash: { type: 'string', minLength: 8 },
		phoneNumber: { type: 'string', pattern: '^01[0125][0-9]{8}$' },
		address: { type: 'string', minLength: 1 },
		accountStatus: { enum: ['active', 'suspended'] },
		vettingStatus: { enum: ['pending', 'approved', 'rejected'] },
		createdByAdminID: { type: ['string', 'null'], pattern: '^[0-9a-fA-F]{24}$' },
	},
};
