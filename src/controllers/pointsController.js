const pointsService = require('../services/pointsService');

const getActorUserID = (req) => req.user?.id || req.user?._id || req.user?.userId || null;

const getMyPoints = async (req, res, next) => {
	try {
		const data = await pointsService.fetchUserPoints(getActorUserID(req), { session: req.mongoSession || null });
		if (!data) {
			return res.status(404).json({ success: false, message: 'Recipient points record not found' });
		}

		return res.status(200).json({ success: true, data });
	} catch (error) {
		return next(error);
	}
};

const getPointsHistory = async (req, res, next) => {
	try {
		const data = await pointsService.fetchPointsHistory(getActorUserID(req), {
			session: req.mongoSession || null,
			limit: req.query.limit,
			page: req.query.page,
		});

		return res.status(200).json({
			success: true,
			count: data.items.length,
			total: data.total,
			page: data.page,
			limit: data.limit,
			hasMore: data.hasMore,
			data: data.items,
		});
	} catch (error) {
		return next(error);
	}
};

const getUserPoints = async (req, res, next) => {
	try {
		const data = await pointsService.fetchPointsByUser(req.params.userId, { session: req.mongoSession || null });
		if (!data) {
			return res.status(404).json({ success: false, message: 'Recipient points record not found' });
		}

		return res.status(200).json({ success: true, data });
	} catch (error) {
		return next(error);
	}
};

module.exports = {
	getMyPoints,
	getPointsHistory,
	getUserPoints,
};
