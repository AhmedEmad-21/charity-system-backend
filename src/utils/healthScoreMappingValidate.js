module.exports = {
  type: 'object',
  additionalProperties: false,
  required: ['healthStatus', 'score'],
  properties: {
    healthStatus: { enum: ['healthy', 'temporary', 'medium', 'chronic'] },
    score: { type: 'number', minimum: 0, maximum: 10 },
  },
};
