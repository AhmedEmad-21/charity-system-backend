const priorityService = require('../services/priorityService');

const canViewPriority = (req, userId) => {
	const requesterId = String(req.user?.id || req.user?._id || '');
	const requesterRole = String(req.user?.role || '');
	return requesterId === String(userId) || requesterRole === 'Staff' || requesterRole === 'Admin';
};

const getUserPriority = async (req, res, next) => {
	try {
		if (!canViewPriority(req, req.params.userId)) {
			return res.status(403).json({ success: false, message: 'Forbidden: insufficient permission' });
		}

		const data = await priorityService.fetchUserPriority(req.params.userId);
		if (!data) {
			return res.status(404).json({ success: false, message: 'Priority not found' });
		}

		return res.status(200).json({ success: true, data });
	} catch (error) {
		return next(error);
	}
};

const getRankedUsers = async (req, res, next) => {
	try {
		const data = await priorityService.fetchRankedUsers();
		return res.status(200).json({ success: true, count: data.length, data });
	} catch (error) {
		return next(error);
	}
};

const getTopPriorityUsers = async (req, res, next) => {
	try {
		const limit = req.query?.limit;
		const data = await priorityService.fetchTopPriority(limit);
		return res.status(200).json({ success: true, count: data.length, data });
	} catch (error) {
		return next(error);
	}
};

const recalculateUser = async (req, res, next) => {
	try {
		const data = await priorityService.recalculatePriority(req.params.userId, { session: req.mongoSession || null });
		return res.status(200).json({ success: true, data });
	} catch (error) {
		return next(error);
	}
};

const recalculateAll = async (req, res, next) => {
	try {
		const approvedOnly = req.query?.approvedOnly !== 'false';
		const data = await priorityService.recalculateAllPriorities({
			session: req.mongoSession || null,
			approvedOnly,
		});
		return res.status(200).json({ success: true, data: { message: 'Priority recalculation completed' } });
	} catch (error) {
		return next(error);
	}
};

module.exports = {
	getUserPriority,
	getRankedUsers,
	getTopPriorityUsers,
	recalculateUser,
	recalculateAll,
};