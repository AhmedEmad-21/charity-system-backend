module.exports = {
	type: 'object',
	additionalProperties: false,
	required: ['donorID', 'amount', 'paymentMethod'],
	properties: {
		donorID: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
		amount: { type: 'number', minimum: 0.01 },
		date: { type: 'string', format: 'date-time' },
		paymentMethod: { type: 'string', minLength: 1 },
		status: { enum: ['pending', 'completed', 'failed', 'refunded'] },
	},
};
