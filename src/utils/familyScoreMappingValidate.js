module.exports = {
  type: 'object',
  additionalProperties: false,
  required: ['minMembers', 'score'],
  properties: {
    minMembers: { type: 'number', minimum: 0 },
    maxMembers: { type: ['number', 'null'], minimum: 0 },
    score: { type: 'number', minimum: 0, maximum: 10 },
  },
};
