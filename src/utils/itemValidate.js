module.exports = {
	type: 'object',
	additionalProperties: false,
	required: ['donationID', 'name', 'quantity', 'category'],
	properties: {
		donationID: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
		name: { type: 'string', minLength: 1 },
		quantity: { type: 'number', minimum: 1 },
		category: { type: 'string', minLength: 1 },
		description: { type: 'string' },
		imageURL: { type: 'string', format: 'uri' },
		status: { enum: ['pendingSort', 'sorted', 'stored'] },
		sortedAt: { type: ['string', 'null'], format: 'date-time' },
		staffID: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
	},
};
