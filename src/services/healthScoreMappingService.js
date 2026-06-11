const HealthScoreMapping = require('../models/healthScoreMappingModel');

const createMappingRule = async (payload) => HealthScoreMapping.create(payload);

const fetchMappings = async () => HealthScoreMapping.find({}).sort({ createdAt: -1 });

const updateMappingRule = async (id, payload) => HealthScoreMapping.findByIdAndUpdate(id, payload, {
	new: true,
	runValidators: true,
});

const deleteMappingRule = async (id) => HealthScoreMapping.findByIdAndDelete(id);

module.exports = {
	createMappingRule,
	fetchMappings,
	updateMappingRule,
	deleteMappingRule,
};
