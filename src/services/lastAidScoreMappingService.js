const LastAidScoreMapping = require('../models/lastAidScoreMappingModel');

const createMappingRule = async (payload) => LastAidScoreMapping.create(payload);

const fetchMappings = async () => LastAidScoreMapping.find({}).sort({ createdAt: -1 });

const updateMappingRule = async (id, payload) => LastAidScoreMapping.findByIdAndUpdate(id, payload, {
	new: true,
	runValidators: true,
});

const deleteMappingRule = async (id) => LastAidScoreMapping.findByIdAndDelete(id);

module.exports = {
	createMappingRule,
	fetchMappings,
	updateMappingRule,
	deleteMappingRule,
};