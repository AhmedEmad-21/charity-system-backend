const transactionService = require('../services/transactionService');

const getActorUserID = (req) => req.user?.id || req.user?._id || req.user?.userId || null;

const createTransaction = async (req, res, next) => {
	try {
		const data = await transactionService.createTransactionLogic(req.body, {
			session: req.mongoSession || null,
			actorUserID: getActorUserID(req),
		});

		return res.status(201).json({ success: true, data });
	} catch (error) {
		return next(error);
	}
};

const getMyTransactions = async (req, res, next) => {
	try {
		const data = await transactionService.fetchUserTransactions(getActorUserID(req), { session: req.mongoSession || null });
		return res.status(200).json({ success: true, count: data.length, data });
	} catch (error) {
		return next(error);
	}
};

const getAllTransactions = async (req, res, next) => {
	try {
		const data = await transactionService.fetchAllTransactions({ session: req.mongoSession || null });
		return res.status(200).json({ success: true, count: data.length, data });
	} catch (error) {
		return next(error);
	}
};

module.exports = {
	createTransaction,
	getMyTransactions,
	getAllTransactions,
};
