const Transaction = require('../models/transactionModel');
const createCrudService = require('./crudServiceFactory');

const baseService = createCrudService(Transaction);

const createTransactionLogic = async (payload, options = {}) => {
	const session = options.session || null;
	const actorUserID = options.actorUserID || payload.donorID;

	const data = {
		donorID: actorUserID,
		amount: payload.amount,
		paymentMethod: payload.paymentMethod,
		status: payload.status || 'pending',
		date: payload.date || new Date(),
	};

	return baseService.create(data, { session });
};

const fetchUserTransactions = async (donorID, options = {}) => {
	return Transaction.find({ donorID })
		.sort({ date: -1, createdAt: -1 })
		.session(options.session || null);
};

const fetchAllTransactions = async (options = {}) => {
	return Transaction.find({})
		.sort({ date: -1, createdAt: -1 })
		.session(options.session || null);
};

module.exports = {
	...baseService,
	createTransactionLogic,
	fetchUserTransactions,
	fetchAllTransactions,
	// Backward compatibility
	create: async (data, options = {}) => createTransactionLogic(data, options),
};
