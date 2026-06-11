const healthScoreMappingService = require('../services/healthScoreMappingService');

const createMapping = async (req, res, next) => {
	try {
		const data = await healthScoreMappingService.createMappingRule(req.body);
		return res.status(201).json({ success: true, data });
	} catch (error) {
		return next(error);
	}
};

const getMappings = async (req, res, next) => {
	try {
		const data = await healthScoreMappingService.fetchMappings();
		return res.status(200).json({ success: true, count: data.length, data });
	} catch (error) {
		return next(error);
	}
};

const updateMapping = async (req, res, next) => {
	try {
		const data = await healthScoreMappingService.updateMappingRule(req.params.id, req.body);
		if (!data) {
			return res.status(404).json({ success: false, message: 'HealthScoreMapping not found' });
		}

		return res.status(200).json({ success: true, data });
	} catch (error) {
		return next(error);
	}
};

const deleteMapping = async (req, res, next) => {
	try {
		const data = await healthScoreMappingService.deleteMappingRule(req.params.id);
		if (!data) {
			return res.status(404).json({ success: false, message: 'HealthScoreMapping not found' });
		}

		return res.status(200).json({ success: true, message: 'HealthScoreMapping deleted successfully', data });
	} catch (error) {
		return next(error);
	}
};

module.exports = {
	createMapping,
	getMappings,
	updateMapping,
	deleteMapping,
};
