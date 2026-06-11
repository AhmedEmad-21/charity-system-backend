module.exports = {
	type: 'object',
	additionalProperties: false,
	required: ['userID', 'messageType', 'content'],
	properties: {
		userID: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
		relatedDonationID: { type: ['string', 'null'], pattern: '^[0-9a-fA-F]{24}$' },
		messageType: { enum: ['donation_received', 'donation_sorted', 'inventory_added', 'donation_distributed', 'request_approved'] },
		content: { type: 'string', minLength: 1 },
		createdAt: { type: 'string', format: 'date-time' },
		isRead: { type: 'boolean' },
	},
};
