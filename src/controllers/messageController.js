const messageService = require('../services/messageService');
const { hasPermission, PERMISSIONS } = require('../middlewares/checkRoleMW');
const { parsePagination } = require('../utils/pagination');

const getActorUserID = (req) => req.user?.id || req.user?._id || req.user?.userId || null;

const getMyMessages = async (req, res, next) => {
	try {
		const pagination = parsePagination(req.query || {}, { defaultLimit: 20, maxLimit: 100 });
		const data = await messageService.fetchUserMessages(getActorUserID(req), { session: req.mongoSession || null, ...(pagination.hasPagination ? pagination : {}) });
		return res.status(200).json({ success: true, count: data.length, page: pagination.hasPagination ? pagination.page : undefined, limit: pagination.hasPagination ? pagination.limit : undefined, data });
	} catch (error) {
		return next(error);
	}
};

const getAllMessages = async (req, res, next) => {
	try {
		const pagination = parsePagination(req.query || {}, { defaultLimit: 20, maxLimit: 100 });
		const data = await messageService.fetchMessages({}, { session: req.mongoSession || null, ...(pagination.hasPagination ? pagination : {}) });
		return res.status(200).json({ success: true, count: data.length, page: pagination.hasPagination ? pagination.page : undefined, limit: pagination.hasPagination ? pagination.limit : undefined, data });
	} catch (error) {
		return next(error);
	}
};

const markAsRead = async (req, res, next) => {
	try {
		const actorUserID = getActorUserID(req);
		const canManageAll = hasPermission(req.user?.role, PERMISSIONS.MANAGE_MESSAGES);

		const data = await messageService.markMessageRead(req.params.id, {
			session: req.mongoSession || null,
			actorUserID,
			canManageAll,
		});

		if (!data) {
			return res.status(404).json({ success: false, message: 'Message not found' });
		}

		return res.status(200).json({ success: true, data });
	} catch (error) {
		return next(error);
	}
};

module.exports = {
	getMyMessages,
	getAllMessages,
	markAsRead,
};
