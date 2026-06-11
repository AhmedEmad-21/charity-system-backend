module.exports = {
	type: 'object',
	additionalProperties: false,
	withinMonthlyLimit: true,
	required: ['recipientRequestID', 'inventoryID', 'quantity'],
	properties: {
		recipientRequestID: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
		inventoryID: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
		quantity: { type: 'number', minimum: 1 },
		pastMonthlyTotal: { type: 'number', minimum: 0 },
		monthlyLimit: { type: 'number', minimum: 0 },
	},
};
