const VettingRequest = require('../models/vettingRequestModel');
const mongoose = require('mongoose');
const User = require('../models/userModel');
const Config = require('../models/configModel');
const RecipientPoints = require('../models/recipientPointsModel');
const SystemAuditLog = require('../models/systemAuditLogModel');
const { upsertPriorityFromVettingData } = require('./priorityEngineService');
const { BadRequestError, ConflictError, NotFoundError } = require('../errors/appErrors');

const getMonthlyAllocation = async (session) => {
	const setting = await Config.findOne({ settingName: 'MONTHLY_LIMIT' }).session(session);
	const parsed = Number(setting?.settingValue);
	if (Number.isFinite(parsed) && parsed >= 0) {
		return parsed;
	}

	return 100;
};

const writeAudit = async (payload) => {
	try {
		await SystemAuditLog.create(payload);
	} catch (error) {
		console.error('[VettingAudit]', error.message);
	}
};

const createRecipientPoints = async (recipientUserID, session) => {
	const monthlyAllocation = await getMonthlyAllocation(session);
	const existing = await RecipientPoints.findOne({ recipientUserID }).session(session);

	if (existing) {
		existing.monthlyAllocation = monthlyAllocation;
		existing.currentPoints = monthlyAllocation;
		existing.lastResetDate = new Date();
		await existing.save({ session });
		return existing;
	}

	return RecipientPoints.create(
		[
			{
				recipientUserID,
				monthlyAllocation,
				currentPoints: monthlyAllocation,
				lastResetDate: new Date(),
			},
		],
		{ session }
	).then((rows) => rows[0]);
};

const calculatePriority = async (vettingRecord, session) => {
	return upsertPriorityFromVettingData(
		{
			recipientUserID: vettingRecord.recipientUserID,
			monthlyIncome: vettingRecord.monthlyIncome,
			familyMembers: vettingRecord.familyMembers,
			healthStatus: vettingRecord.healthStatus,
		},
		{ session }
	);
};

const isRetryableTransactionError = (error) => (
	Boolean(error?.errorLabels?.includes('TransientTransactionError'))
	|| error?.code === 112
	|| String(error?.message || '').includes('Please retry your operation or multi-document transaction')
	|| String(error?.message || '').toLowerCase().includes('write conflict')
);

const withTransactionRetry = async (operation, { retries = 2 } = {}) => {
	let lastError = null;

	for (let attempt = 0; attempt <= retries; attempt += 1) {
		const session = await mongoose.startSession();
		try {
			session.startTransaction();
			const result = await operation(session);
			await session.commitTransaction();
			return result;
		} catch (error) {
			lastError = error;
			try {
				await session.abortTransaction();
			} catch (abortError) {
				console.error('[VettingService] Transaction abort failed:', abortError.message);
			}

			if (!isRetryableTransactionError(error) || attempt === retries) {
				throw error;
			}
		} finally {
			session.endSession();
		}
	}

	throw lastError;
};

const createRequest = async (data, options = {}) => {
	const { session = null } = options;
	const existing = await VettingRequest.findOne({ recipientUserID: data.recipientUserID });
	if (existing) {
		throw new ConflictError('Vetting request already exists for this user');
	}

	return VettingRequest.create([data], session ? { session } : {}).then((rows) => rows[0]);
};

const getUserRequest = async (recipientUserID) => {
	return VettingRequest.findOne({ recipientUserID });
};

const getRequestById = async (id) => VettingRequest.findById(id);

const fetchPendingRequests = async () => VettingRequest.find({ vettingStatus: 'pending' }).sort({ createdAt: -1 });

const fetchByStatus = async (status) => VettingRequest.find({ vettingStatus: status }).sort({ createdAt: -1 });

const approveRequest = async (id, reviewerStaffID, options = {}) => {
	const { session: externalSession = null } = options;
	if (!externalSession) {
		return withTransactionRetry((session) => approveRequest(id, reviewerStaffID, { ...options, session, managedTransaction: true }));
	}

	const session = externalSession || await mongoose.startSession();
	const ownsSession = !externalSession && !options.managedTransaction;
	const managesTransaction = !options.managedTransaction && !session.inTransaction();

	try {
		if (managesTransaction) {
			session.startTransaction();
		}

		const vetting = await VettingRequest.findById(id).session(session);
		if (!vetting) {
			if (ownsSession) {
				await session.abortTransaction();
			}
			return null;
		}

		if (vetting.vettingStatus !== 'pending') {
			throw new ConflictError('Vetting request already reviewed');
		}

		vetting.vettingStatus = 'approved';
		vetting.reviewerStaffID = reviewerStaffID || null;
		vetting.reviewDate = new Date();
		await vetting.save({ session });

		await User.findByIdAndUpdate(vetting.recipientUserID, { vettingStatus: 'approved' }, { session });

		await createRecipientPoints(vetting.recipientUserID, session);

		if (managesTransaction) {
			await session.commitTransaction();
		}

		await calculatePriority(vetting, null);

		return vetting;
	} catch (error) {
		if (isRetryableTransactionError(error) && !options._retrying) {
			return approveRequest(id, reviewerStaffID, { ...options, _retrying: true });
		}

		if (managesTransaction) {
			await session.abortTransaction();
		}
		throw error;
	} finally {
		if (ownsSession) {
			session.endSession();
		}
	}
};

const rejectRequest = async (id, reviewerStaffID, notes = '', options = {}) => {
	const { session: externalSession = null } = options;
	if (!externalSession) {
		return withTransactionRetry((session) => rejectRequest(id, reviewerStaffID, notes, { ...options, session, managedTransaction: true }));
	}

	const session = externalSession || await mongoose.startSession();
	const ownsSession = !externalSession && !options.managedTransaction;
	const managesTransaction = !options.managedTransaction && !session.inTransaction();

	try {
		if (managesTransaction) {
			session.startTransaction();
		}

		const vetting = await VettingRequest.findById(id).session(session);
		if (!vetting) {
			if (ownsSession) {
				await session.abortTransaction();
			}
			return null;
		}

		if (vetting.vettingStatus !== 'pending') {
			throw new ConflictError('Vetting request already reviewed');
		}

		vetting.vettingStatus = 'rejected';
		vetting.reviewerStaffID = reviewerStaffID || null;
		vetting.reviewDate = new Date();
		vetting.notes = notes || vetting.notes;
		await vetting.save({ session });

		await User.findByIdAndUpdate(vetting.recipientUserID, { vettingStatus: 'rejected' }, { session });

		await writeAudit({
			eventType: 'vetting_rejected',
			status: 'success',
			details: {
				vettingRequestID: String(vetting._id),
				recipientUserID: String(vetting.recipientUserID),
				reviewerStaffID: vetting.reviewerStaffID ? String(vetting.reviewerStaffID) : null,
				notes: vetting.notes || '',
			},
			executedAt: new Date(),
		});

		if (managesTransaction) {
			await session.commitTransaction();
		}

		return vetting;
	} catch (error) {
		if (isRetryableTransactionError(error) && !options._retrying) {
			return rejectRequest(id, reviewerStaffID, notes, { ...options, _retrying: true });
		}

		if (managesTransaction) {
			await session.abortTransaction();
		}
		throw error;
	} finally {
		if (ownsSession) {
			session.endSession();
		}
	}
};

module.exports = {
	createRequest,
	getUserRequest,
	getRequestById,
	fetchPendingRequests,
	fetchByStatus,
	approveRequest,
	rejectRequest,
	createRecipientPoints,
	calculatePriority,
};
