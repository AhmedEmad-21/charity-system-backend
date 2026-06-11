const appService = require('../services/appService');

module.exports = {
	root(req, res) {
		return res.json({
			success: true,
			message: 'running',
			data: { service: 'Charity System API' },
		});
	},

	health(req, res) {
		return res.status(200).json({
			success: true,
			message: 'healthy',
			data: appService.getSystemSnapshot(),
		});
	},

	status(req, res) {
		return res.status(200).json({
			success: true,
			message: 'system status',
			data: appService.buildStatusPayload(),
		});
	},

	systemStatus(req, res) {
		return res.status(200).json({
			success: true,
			message: 'system status',
			data: appService.buildStatusPayload(),
		});
	},
};