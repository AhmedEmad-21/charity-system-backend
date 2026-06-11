module.exports = {
	type: 'object',
	additionalProperties: false,
	required: ['recipientUserID'],
	properties: {
		recipientUserID: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
		requestDate: { type: 'string', format: 'date-time' },
		status: { enum: ['pending', 'approved', 'rejected', 'fulfilled'] },
		notes: { type: 'string' },
		staffReviewerID: { type: ['string', 'null'], pattern: '^[0-9a-fA-F]{24}$' },
	},
};
