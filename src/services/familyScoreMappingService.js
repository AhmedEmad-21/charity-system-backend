const FamilyScoreMapping = require('../models/familyScoreMappingModel');

const createMappingRule = async (payload) => FamilyScoreMapping.create(payload);

const fetchMappings = async () => FamilyScoreMapping.find({}).sort({ createdAt: -1 });

const updateMappingRule = async (id, payload) => FamilyScoreMapping.findByIdAndUpdate(id, payload, {
	new: true,
	runValidators: true,
});

const deleteMappingRule = async (id) => FamilyScoreMapping.findByIdAndDelete(id);

module.exports = {
	createMappingRule,
	fetchMappings,
	updateMappingRule,
	deleteMappingRule,
};
