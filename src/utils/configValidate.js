module.exports = {
	type: 'object',
	additionalProperties: false,
	required: ['settingName', 'settingValue'],
	properties: {
		settingName: { type: 'string', minLength: 1 },
		settingValue: {},
		description: { type: 'string' },
		lastUpdatedBy: { type: ['string', 'null'] },
	},
};
