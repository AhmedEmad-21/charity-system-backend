module.exports = {
	type: 'object',
	additionalProperties: false,
	required: ['minMonths', 'score'],
	properties: {
		minMonths: { type: 'number', minimum: 0 },
		maxMonths: { type: ['number', 'null'], minimum: 0 },
		score: { type: 'number', minimum: 0, maximum: 10 },
	},
};