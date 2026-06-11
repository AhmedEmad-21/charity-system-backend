module.exports = {
	type: 'object',
	additionalProperties: false,
	required: ['donorID', 'proposedPickupTime', 'pickupLocation'],
	properties: {
		donorID: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
		proposedPickupTime: { type: 'string', format: 'date-time' },
		pickupLocation: { type: 'string', minLength: 1 },
		status: { enum: ['pendingPickup', 'pickedUp', 'sorted', 'stored', 'distributed'] },
		currentStatus: { enum: ['pendingPickup', 'pickedUp', 'sorted', 'stored', 'distributed'] },
		notes: { type: 'string' },
	},
	allOf: [
		{
			if: {
				properties: {
					currentStatus: { const: 'pendingPickup' },
				},
				required: ['currentStatus', 'status'],
			},
			then: {
				properties: {
					status: { enum: ['pendingPickup', 'pickedUp'] },
				},
			},
		},
		{
			if: {
				properties: {
					currentStatus: { const: 'pickedUp' },
				},
				required: ['currentStatus', 'status'],
			},
			then: {
				properties: {
					status: { enum: ['pickedUp', 'sorted'] },
				},
			},
		},
		{
			if: {
				properties: {
					currentStatus: { const: 'sorted' },
				},
				required: ['currentStatus', 'status'],
			},
			then: {
				properties: {
					status: { enum: ['sorted', 'stored'] },
				},
			},
		},
		{
			if: {
				properties: {
					currentStatus: { const: 'stored' },
				},
				required: ['currentStatus', 'status'],
			},
			then: {
				properties: {
					status: { enum: ['stored', 'distributed'] },
				},
			},
		},
	],
};
