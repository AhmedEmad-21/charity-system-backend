module.exports = {
	type: 'object',
	additionalProperties: false,
	required: ['inventoryID', 'staffID', 'movementType', 'quantityChange'],
	properties: {
		inventoryID: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
		staffID: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
		movementType: { enum: ['add', 'remove', 'distribute', 'adjust'] },
		quantityChange: { type: 'number' },
		timestamp: { type: 'string', format: 'date-time' },
		notes: { type: 'string' },
	},
};
