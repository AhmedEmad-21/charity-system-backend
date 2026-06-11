const RecipientPoints = require('../models/recipientPointsModel');
const PointsTransaction = require('../models/pointsTransactionModel');

const fetchUserPoints = async (recipientUserID, options = {}) => {
	return RecipientPoints.findOne({ recipientUserID })
		.populate('recipientUserID', 'name email role vettingStatus')
		.session(options.session || null);
};

const fetchPointsHistory = async (recipientUserID, options = {}) => {
	const session = options.session || null;
	const limitRaw = Number(options.limit ?? 20);
	const pageRaw = Number(options.page ?? 1);
	const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20;
	const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
	const skip = (page - 1) * limit;

	const [items, total] = await Promise.all([
		PointsTransaction.find({ recipientUserID })
			.sort({ date: -1, createdAt: -1 })
			.skip(skip)
			.limit(limit)
			.populate('relatedRequestID', 'status requestDate notes')
			.session(session),
		PointsTransaction.countDocuments({ recipientUserID }).session(session),
	]);

	return {
		items,
		total,
		page,
		limit,
		hasMore: skip + items.length < total,
	};
};

const fetchPointsByUser = async (userId, options = {}) => fetchUserPoints(userId, options);

module.exports = {
	fetchUserPoints,
	fetchPointsHistory,
	fetchPointsByUser,
};
