const RequestedItem = require('../models/requestedItemModel');
const RecipientRequest = require('../models/recipientRequestModel');
const Inventory = require('../models/inventoryModel');
const RecipientItemQuota = require('../models/recipientItemQuotaModel');
const inventoryService = require('./inventoryService');
const createCrudService = require('./crudServiceFactory');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../errors/appErrors');

const baseService = createCrudService(RequestedItem);

const toObject = (value) => {
	if (!value) {
		return null;
	}

	return typeof value.toObject === 'function' ? value.toObject() : value;
};

const getQuotaRecord = async ({ recipientUserID, inventoryID, monthlyLimit, session = null }) => {
	let quota = await RecipientItemQuota.findOne({ recipientUserID, inventoryID }).session(session);

	if (!quota) {
		quota = await RecipientItemQuota.create(
			[
				{
					recipientUserID,
					inventoryID,
					pastMonthlyTotal: 0,
					monthlyLimit,
				},
			],
			{ session }
		);
		return quota[0];
	}

	if (quota.monthlyLimit !== monthlyLimit) {
		quota.monthlyLimit = monthlyLimit;
		await quota.save({ session });
	}

	return quota;
};

const attachRequestedItem = (requestedItem) => {
	const data = toObject(requestedItem);
	if (!data) {
		return null;
	}

	return data;
};

const validateQuota = (quota, quantity) => {
	if (quota.pastMonthlyTotal >= quota.monthlyLimit) {
		throw new BadRequestError('Monthly item quota already reached for this inventory item');
	}

	if (quota.pastMonthlyTotal + quantity > quota.monthlyLimit) {
		throw new BadRequestError('Requested quantity exceeds inventory monthlyLimit for this recipient');
	}
};

module.exports = {
	...baseService,
	async createRequestedItemLogic(data, options = {}) {
		const { session = null } = options;
		const requestedQuantity = Number(data.quantity || 0);
		const actorUserID = options.actorUserID || null;
		const actorRole = String(options.actorRole || '').toLowerCase();

		if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
			throw new BadRequestError('Requested quantity must be greater than zero');
		}

		const recipientRequest = await RecipientRequest.findById(data.recipientRequestID)
			.select('recipientUserID')
			.session(session);

		if (!recipientRequest) {
			throw new NotFoundError('RecipientRequest not found');
		}

		if (actorUserID && actorRole !== 'staff' && actorRole !== 'admin' && String(recipientRequest.recipientUserID) !== String(actorUserID)) {
			throw new ForbiddenError('Forbidden: requested item must belong to the current recipient');
		}

		const inventoryItem = await Inventory.findById(data.inventoryID)
			.select('monthlyLimit')
			.session(session);

		if (!inventoryItem) {
			throw new NotFoundError('Inventory item not found');
		}

		const quota = await getQuotaRecord({
			recipientUserID: recipientRequest.recipientUserID,
			inventoryID: inventoryItem._id,
			monthlyLimit: inventoryItem.monthlyLimit,
			session,
		});

		validateQuota(quota, requestedQuantity);

		return RequestedItem.create([data], session ? { session } : {}).then((rows) => rows[0]);
	},

	async fetchRequestedItem(id, options = {}) {
		const session = options.session || null;
		const actorUserID = options.actorUserID || null;
		const actorRole = String(options.actorRole || '').toLowerCase();

		const requestedItem = await RequestedItem.findById(id)
			.populate('recipientRequestID', 'recipientUserID requestDate status notes staffReviewerID')
			.populate('inventoryID', 'itemName category quantity itemPointsCost monthlyLimit itemCondition storageLocation')
			.session(session);

		if (!requestedItem) {
			return null;
		}

		if (actorUserID && actorRole !== 'staff' && actorRole !== 'admin') {
			const ownerID = String(requestedItem.recipientRequestID?.recipientUserID || '');
			if (ownerID !== String(actorUserID)) {
				throw new ForbiddenError('Forbidden: requested item does not belong to the current recipient');
			}
		}

		return attachRequestedItem(requestedItem);
	},

	async applyApprovedConsumption(recipientRequestID, options = {}) {
		const { session = null, staffID = null } = options;
		const request = await RecipientRequest.findById(recipientRequestID)
			.select('recipientUserID')
			.session(session);

		if (!request) {
			throw new NotFoundError('RecipientRequest not found');
		}

		const requestedItems = await RequestedItem.find({ recipientRequestID })
			.select('inventoryID quantity')
			.session(session);

		if (!requestedItems.length) {
			throw new NotFoundError('No requested items found for this recipient request');
		}

		const inventoryIds = [...new Set(requestedItems.map((item) => String(item.inventoryID)))];
		const inventoryItems = await Inventory.find({ _id: { $in: inventoryIds } })
			.select('quantity monthlyLimit itemPointsCost')
			.session(session);
		const inventoryMap = new Map(inventoryItems.map((item) => [String(item._id), item]));

		let totalPointsCost = 0;
		for (const item of requestedItems) {
			const inventoryItem = inventoryMap.get(String(item.inventoryID));

			if (!inventoryItem) {
				throw new NotFoundError('Inventory item not found during approval');
			}

			const quota = await getQuotaRecord({
				recipientUserID: request.recipientUserID,
				inventoryID: inventoryItem._id,
				monthlyLimit: inventoryItem.monthlyLimit,
				session,
			});

			validateQuota(quota, item.quantity);
			quota.pastMonthlyTotal += item.quantity;
			await quota.save({ session });

			await inventoryService.decreaseForDistribution({
				inventoryID: inventoryItem._id,
				quantity: item.quantity,
				staffID,
				session,
				notes: `Recipient request ${recipientRequestID}`,
			});

			totalPointsCost += item.quantity * inventoryItem.itemPointsCost;
		}

		return {
			totalPointsCost,
			totalItems: requestedItems.length,
		};
	},

	// Backward compatibility
	create: async (data, options = {}) => module.exports.createRequestedItemLogic(data, options),
	getById: async (id, options = {}) => module.exports.fetchRequestedItem(id, options),
};
