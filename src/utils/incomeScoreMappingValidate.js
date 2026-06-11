module.exports = {
  type: 'object',
  additionalProperties: false,
  required: ['minIncome', 'score'],
  properties: {
    minIncome: { type: 'number', minimum: 0 },
    maxIncome: { type: ['number', 'null'], minimum: 0 },
    score: { type: 'number', minimum: 0, maximum: 10 },
  },
};
