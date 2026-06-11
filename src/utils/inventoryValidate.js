module.exports = {
	type: 'object',
	additionalProperties: false,
	required: ['sourceItemID', 'itemName', 'quantity', 'itemCondition', 'storageLocation', 'staffID'],
	properties: {
		sourceItemID: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
		itemName: { type: 'string', minLength: 1 },
		category: { type: 'string' },
		quantity: { type: 'number', minimum: 0 },
		itemCondition: { enum: ['new', 'excellent', 'good', 'fair'] },
		storageLocation: { type: 'string', minLength: 1 },
		monthlyLimit: { type: 'number', minimum: 0 },
		itemPointsCost: { type: 'number', minimum: 0 },
		lastMovementDate: { type: 'string', format: 'date-time' },
		staffID: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
		movementNotes: { type: 'string' },
	},
};
