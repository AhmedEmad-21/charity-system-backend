const Inventory = require('../models/inventoryModel');
const InventoryMovement = require('../models/inventoryMovementModel');
const SystemAuditLog = require('../models/systemAuditLogModel');
const createCrudService = require('./crudServiceFactory');
const { BadRequestError, NotFoundError } = require('../errors/appErrors');
const { parsePagination } = require('../utils/pagination');

const baseService = createCrudService(Inventory);

const createMovement = async ({
	inventoryID,
	staffID,
	movementType,
	quantityChange,
	notes = '',
	session = null,
}) => {
	if (!staffID) {
		throw new BadRequestError('staffID is required for inventory movement tracking');
	}

	await InventoryMovement.create(
		[
			{
				inventoryID,
				staffID,
				movementType,
				quantityChange,
				timestamp: new Date(),
				notes,
			},
		],
		{ session }
	);
};

const logAuditSafely = async (payload) => {
	try {
		await SystemAuditLog.create(payload);
	} catch (error) {
		console.error('[InventoryAudit]', error.message);
	}
};

const defaultStorageLocation = 'sorting_zone';
const DEFAULT_LOW_STOCK_THRESHOLD = 10;

const isRetryableWriteConflict = (error) => (
	String(error?.message || '').toLowerCase().includes('write conflict')
	|| error?.code === 112
);

const buildInventoryFilter = (filter = {}) => {
	const query = {};

	if (filter.category) {
		query.category = String(filter.category).trim();
	}

	if (filter.itemName) {
		query.itemName = { $regex: String(filter.itemName).trim(), $options: 'i' };
	}

	if (filter.itemCondition) {
		query.itemCondition = String(filter.itemCondition).trim();
	}

	if (filter.storageLocation) {
		query.storageLocation = String(filter.storageLocation).trim();
	}

	if (Object.prototype.hasOwnProperty.call(filter, 'minQuantity')) {
		const minQuantity = Number(filter.minQuantity);
		if (Number.isFinite(minQuantity)) {
			query.quantity = { ...(query.quantity || {}), $gte: minQuantity };
		}
	}

	return query;
};

module.exports = {
	...baseService,

	async fetchInventory(filter = {}, options = {}) {
		const pagination = parsePagination(options, { defaultLimit: 20, maxLimit: 100 });
		return baseService.list(buildInventoryFilter(filter), {
			...options,
			...pagination,
			select: 'sourceItemID itemName category quantity itemCondition storageLocation monthlyLimit itemPointsCost lastMovementDate createdAt updatedAt',
		});
	},

	async filterInventoryLogic(filter = {}, options = {}) {
		return baseService.list(buildInventoryFilter(filter), options);
	},

	async getLowStockItems(options = {}) {
		return Inventory.find({ quantity: { $lte: DEFAULT_LOW_STOCK_THRESHOLD } })
			.select('sourceItemID itemName category quantity itemCondition storageLocation monthlyLimit itemPointsCost lastMovementDate createdAt updatedAt')
			.sort({ quantity: 1, createdAt: -1 })
			.session(options.session || null);
	},

	async createInventoryItem(data, options = {}) {
		const { session = null } = options;
		const payload = {
			...data,
			category: data.category || '',
		};

		if (Number(payload.quantity) < 0) {
			throw new BadRequestError('Inventory quantity cannot be negative');
		}

		if (Number(payload.quantity) > 0 && !payload.staffID) {
			throw new BadRequestError('staffID is required when creating inventory with quantity');
		}

		const created = await baseService.create(payload, { session });

		if (Number(created.quantity) > 0 && payload.staffID) {
			await createMovement({
				inventoryID: created._id,
				staffID: payload.staffID,
				movementType: 'add',
				quantityChange: created.quantity,
				notes: payload.movementNotes || 'Initial inventory create',
				session,
			});
		}

		return created;
	},

	async updateInventoryItem(id, data, options = {}) {
		if (options._retrying) {
			return updateInventoryItemWithRetry(id, data, options);
		}

		return updateInventoryItemWithRetry(id, data, options);
	},

	async upsertFromSortedItem(item, { staffID, session = null } = {}) {
		const filter = {
			itemName: item.name,
			category: item.category || '',
			itemCondition: 'good',
			storageLocation: defaultStorageLocation,
		};

		let inventory = await Inventory.findOne(filter).session(session);

		if (!inventory) {
			const created = await Inventory.create(
				[
					{
						sourceItemID: item._id,
						itemName: item.name,
						category: item.category || '',
						quantity: item.quantity,
						itemCondition: 'good',
						storageLocation: defaultStorageLocation,
						lastMovementDate: new Date(),
					},
				],
				{ session }
			);
			inventory = created[0];
		} else {
			inventory.quantity += item.quantity;
			inventory.lastMovementDate = new Date();
			await inventory.save({ session });
		}

		await createMovement({
			inventoryID: inventory._id,
			staffID,
			movementType: 'add',
			quantityChange: item.quantity,
			notes: `Sorted from item ${item._id}`,
			session,
		});

		return inventory;
	},

	async decreaseForDistribution({ inventoryID, quantity, staffID, session = null, notes = '' }) {
		const inventory = await Inventory.findOneAndUpdate(
			{ _id: inventoryID, quantity: { $gte: quantity } },
			{
				$inc: { quantity: -quantity },
				$set: { lastMovementDate: new Date() },
			},
			{ new: true, session }
		);
		if (!inventory) {
			throw new NotFoundError('Inventory item not found during distribution');
		}

		await createMovement({
			inventoryID,
			staffID,
			movementType: 'distribute',
			quantityChange: -quantity,
			notes: notes || 'Recipient request distribution',
			session,
		});

		return inventory;
	},

	// Backward compatibility
	create: async (data, options = {}) => module.exports.createInventoryItem(data, options),
	updateById: async (id, data, options = {}) => module.exports.updateInventoryItem(id, data, options),
};

async function updateInventoryItemWithRetry(id, data, options = {}) {
	const { session = null } = options;
	const existing = await Inventory.findById(id).session(session);
	if (!existing) {
		return null;
	}

	const payload = {
		...data,
		category: Object.prototype.hasOwnProperty.call(data, 'category') ? data.category : existing.category,
	};

	if (Object.prototype.hasOwnProperty.call(payload, 'quantity') && Number(payload.quantity) < 0) {
		throw new BadRequestError('Inventory quantity cannot be negative');
	}

	try {
		const updated = await baseService.updateById(id, payload, { session });

		if (Object.prototype.hasOwnProperty.call(payload, 'quantity')) {
			const difference = Number(updated.quantity) - Number(existing.quantity);
			if (difference !== 0) {
				await createMovement({
					inventoryID: updated._id,
					staffID: payload.staffID,
					movementType: 'adjust',
					quantityChange: difference,
					notes: payload.movementNotes || 'Manual inventory quantity adjustment',
					session,
				});

				await logAuditSafely({
					eventType: 'manual_inventory_adjustment',
					status: 'success',
					details: {
						inventoryID: String(updated._id),
						previousQuantity: existing.quantity,
						updatedQuantity: updated.quantity,
						staffID: payload.staffID || null,
					},
					executedAt: new Date(),
				});
			}
		}

		return updated;
	} catch (error) {
		if (isRetryableWriteConflict(error) && !options._retrying) {
			return updateInventoryItemWithRetry(id, data, { ...options, _retrying: true });
		}

		throw error;
	}
}
