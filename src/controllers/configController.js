const createCrudController = require('./crudControllerFactory');
const configService = require('../services/configService');
const systemJobsService = require('../services/systemJobsService');

const baseController = createCrudController(configService, 'Config');

const setAuditEntry = (req, action, payload) => {
	req.res.locals.auditEntry = {
		eventType: `config_${action}`,
		status: payload.status,
		before: payload.before,
		after: payload.after,
		metadata: payload.metadata || {},
	};
};

module.exports = {
	...baseController,
	async getStats(req, res, next) {
		try {
			const data = await configService.calculateStats();
			setAuditEntry(req, 'dashboard_stats_viewed', {
				status: 'success',
				before: null,
				after: data,
				metadata: { actorUserID: req.user?.id || req.user?._id || req.user?.userId || null },
			});

			return res.status(200).json({ success: true, data });
		} catch (error) {
			setAuditEntry(req, 'dashboard_stats_viewed', {
				status: 'failed',
				before: null,
				after: null,
				error,
				metadata: { actorUserID: req.user?.id || req.user?._id || req.user?.userId || null },
			});
			return next(error);
		}
	},

	async getVettingSummary(req, res, next) {
		try {
			const data = await configService.calculateVettingSummary();
			setAuditEntry(req, 'dashboard_vetting_summary_viewed', {
				status: 'success',
				before: null,
				after: data,
				metadata: { actorUserID: req.user?.id || req.user?._id || req.user?.userId || null },
			});

			return res.status(200).json({ success: true, data });
		} catch (error) {
			setAuditEntry(req, 'dashboard_vetting_summary_viewed', {
				status: 'failed',
				before: null,
				after: null,
				error,
				metadata: { actorUserID: req.user?.id || req.user?._id || req.user?.userId || null },
			});
			return next(error);
		}
	},

	async getRequestsSummary(req, res, next) {
		try {
			const data = await configService.calculateRequestsSummary();
			setAuditEntry(req, 'dashboard_requests_summary_viewed', {
				status: 'success',
				before: null,
				after: data,
				metadata: { actorUserID: req.user?.id || req.user?._id || req.user?.userId || null },
			});

			return res.status(200).json({ success: true, data });
		} catch (error) {
			setAuditEntry(req, 'dashboard_requests_summary_viewed', {
				status: 'failed',
				before: null,
				after: null,
				error,
				metadata: { actorUserID: req.user?.id || req.user?._id || req.user?.userId || null },
			});
			return next(error);
		}
	},

	async runMonthlyReset(req, res, next) {
		try {
			const data = await systemJobsService.resetPoints();
			setAuditEntry(req, 'system_monthly_reset_run', {
				status: 'success',
				before: null,
				after: data,
				metadata: { actorUserID: req.user?.id || req.user?._id || req.user?.userId || null },
			});

			return res.status(200).json({ success: true, data });
		} catch (error) {
			setAuditEntry(req, 'system_monthly_reset_run', {
				status: 'failed',
				before: null,
				after: null,
				error,
				metadata: { actorUserID: req.user?.id || req.user?._id || req.user?.userId || null },
			});
			return next(error);
		}
	},

	async recalculatePriorities(req, res, next) {
		try {
			const data = await systemJobsService.recalculateAll();
			setAuditEntry(req, 'system_priorities_recalculated', {
				status: 'success',
				before: null,
				after: data,
				metadata: { actorUserID: req.user?.id || req.user?._id || req.user?.userId || null },
			});

			return res.status(200).json({ success: true, data });
		} catch (error) {
			setAuditEntry(req, 'system_priorities_recalculated', {
				status: 'failed',
				before: null,
				after: null,
				error,
				metadata: { actorUserID: req.user?.id || req.user?._id || req.user?.userId || null },
			});
			return next(error);
		}
	},

	async runAllocation(req, res, next) {
		try {
			const data = await systemJobsService.runSmartAllocation();
			setAuditEntry(req, 'system_allocation_run', {
				status: 'success',
				before: null,
				after: data,
				metadata: { actorUserID: req.user?.id || req.user?._id || req.user?.userId || null },
			});

			return res.status(200).json({ success: true, data });
		} catch (error) {
			setAuditEntry(req, 'system_allocation_run', {
				status: 'failed',
				before: null,
				after: null,
				error,
				metadata: { actorUserID: req.user?.id || req.user?._id || req.user?.userId || null },
			});
			return next(error);
		}
	},

	async dashboard(req, res, next) {
		try {
			const data = await configService.calculateStats();
			setAuditEntry(req, 'dashboard_viewed', {
				status: 'success',
				before: null,
				after: data,
				metadata: { actorUserID: req.user?.id || req.user?._id || req.user?.userId || null },
			});
			return res.status(200).json({ success: true, data });
		} catch (error) {
			setAuditEntry(req, 'dashboard_viewed', {
				status: 'failed',
				before: null,
				after: null,
				error,
				metadata: { actorUserID: req.user?.id || req.user?._id || req.user?.userId || null },
			});
			return next(error);
		}
	},
};
