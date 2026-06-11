const recipientRequestService = require('../services/recipientRequestService');
const { parsePagination } = require('../utils/pagination');

const setAuditEntry = (req, action, payload) => {
	req.res.locals.auditEntry = {
		eventType: `recipient_request_${action}`,
		status: payload.status,
		before: payload.before,
		after: payload.after,
		metadata: payload.metadata || {},
	};
};

const getActorUserID = (req) => req.user?.id || req.user?._id || req.user?.userId || null;

const respond = (res, data, statusCode = 200) => res.status(statusCode).json({ success: true, data });

const buildAuditMetadata = (req) => ({ actorUserID: getActorUserID(req) });

module.exports = {
	async createRequest(req, res, next) {
		try {
			const data = await recipientRequestService.createRecipientRequest(
				{
					...req.body,
					recipientUserID: getActorUserID(req),
				},
				{ session: req.mongoSession || null }
			);

			setAuditEntry(req, 'created', {
				status: 'success',
				before: null,
				after: data,
				metadata: buildAuditMetadata(req),
			});

			return respond(res, data, 201);
		} catch (error) {
			setAuditEntry(req, 'created', {
				status: 'failed',
				before: null,
				after: null,
				error,
				metadata: buildAuditMetadata(req),
			});
			return next(error);
		}
	},

	async getMyRequests(req, res, next) {
		try {
			const pagination = parsePagination(req.query || {}, { defaultLimit: 20, maxLimit: 100 });
			const data = await recipientRequestService.fetchUserRequests(getActorUserID(req), { session: req.mongoSession || null, ...(pagination.hasPagination ? pagination : {}) });
			return res.status(200).json({ success: true, count: data.length, page: pagination.hasPagination ? pagination.page : undefined, limit: pagination.hasPagination ? pagination.limit : undefined, data });
		} catch (error) {
			return next(error);
		}
	},

	async getRequestById(req, res, next) {
		try {
			const data = await recipientRequestService.fetchRequestById(req.params.id, { session: req.mongoSession || null });
			if (!data) {
				return res.status(404).json({ success: false, message: 'RecipientRequest not found' });
			}

			const actorUserID = getActorUserID(req);
			const actorRole = String(req.user?.role || '').toLowerCase();
			const isStaff = actorRole === 'staff' || actorRole === 'admin';
			const ownerID = String(data.recipientUserID?._id || data.recipientUserID || '');

			if (!isStaff && ownerID !== String(actorUserID)) {
				return res.status(403).json({ success: false, message: 'Forbidden: request does not belong to the current recipient' });
			}

			return respond(res, data);
		} catch (error) {
			return next(error);
		}
	},

	async getAllRequests(req, res, next) {
		try {
			const pagination = parsePagination(req.query || {}, { defaultLimit: 20, maxLimit: 100 });
			const data = await recipientRequestService.fetchAllRequests({ session: req.mongoSession || null, ...(pagination.hasPagination ? pagination : {}) });
			return res.status(200).json({ success: true, count: data.length, page: pagination.hasPagination ? pagination.page : undefined, limit: pagination.hasPagination ? pagination.limit : undefined, data });
		} catch (error) {
			return next(error);
		}
	},

	async reviewRequest(req, res, next) {
		try {
			const before = await recipientRequestService.fetchRequestById(req.params.id, { session: req.mongoSession || null });
			const data = await recipientRequestService.reviewRequestLogic(
				req.params.id,
				{
					status: req.body.status,
					staffReviewerID: getActorUserID(req),
				},
				{ session: req.mongoSession || null }
			);

			if (!data) {
				return res.status(404).json({ success: false, message: 'RecipientRequest not found' });
			}

			setAuditEntry(req, `review_${String(req.body.status || '').toLowerCase()}`, {
				status: 'success',
				before,
				after: data,
				metadata: buildAuditMetadata(req),
			});

			return respond(res, data);
		} catch (error) {
			setAuditEntry(req, 'review_failed', {
				status: 'failed',
				before: null,
				after: { id: req.params.id, status: req.body.status },
				error,
				metadata: buildAuditMetadata(req),
			});
			return next(error);
		}
	},

	async getAvailableItems(req, res, next) {
		try {
			const data = await recipientRequestService.calculateAvailableItems({ session: req.mongoSession || null });
			return res.status(200).json({ success: true, count: data.length, data });
		} catch (error) {
			return next(error);
		}
	},

	async getEligibleItems(req, res, next) {
		try {
			const data = await recipientRequestService.calculateEligibleItems(getActorUserID(req), { session: req.mongoSession || null });
			return res.status(200).json({ success: true, count: data.length, data });
		} catch (error) {
			return next(error);
		}
	},

	async getRecommendations(req, res, next) {
		try {
			const data = await recipientRequestService.generateRecommendations(getActorUserID(req), { session: req.mongoSession || null });
			return res.status(200).json({ success: true, count: data.length, data });
		} catch (error) {
			return next(error);
		}
	},

	// Backward-compatible aliases used by older callers/tests.
	approve: async (req, res, next) => {
		req.body.status = 'approved';
		return module.exports.reviewRequest(req, res, next);
	},
	fulfill: async (req, res, next) => {
		req.body.status = 'fulfilled';
		return module.exports.reviewRequest(req, res, next);
	},
};
