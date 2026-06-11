const IncomeScoreMapping = require('../models/incomeScoreMappingModel');

const createMappingRule = async (payload) => IncomeScoreMapping.create(payload);

const fetchMappings = async () => IncomeScoreMapping.find({}).sort({ createdAt: -1 });

const updateMappingRule = async (id, payload) => IncomeScoreMapping.findByIdAndUpdate(id, payload, {
	new: true,
	runValidators: true,
});

const deleteMappingRule = async (id) => IncomeScoreMapping.findByIdAndDelete(id);

module.exports = {
	createMappingRule,
	fetchMappings,
	updateMappingRule,
	deleteMappingRule,
};
