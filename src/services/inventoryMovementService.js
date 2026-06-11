const InventoryMovement = require('../models/inventoryMovementModel');
const Inventory = require('../models/inventoryModel');
const inventoryService = require('./inventoryService');
const { BadRequestError, NotFoundError } = require('../errors/appErrors');

const createMovement = async (payload, options = {}) => {
	return InventoryMovement.create([payload], options.session ? { session: options.session } : {}).then((rows) => rows[0]);
};

const fetchMovements = async (filter = {}, options = {}) => {
	const query = {};

	if (filter.inventoryID) {
		query.inventoryID = filter.inventoryID;
	}

	if (filter.staffID) {
		query.staffID = filter.staffID;
	}

	if (filter.movementType) {
		query.movementType = filter.movementType;
	}

	return InventoryMovement.find(query).sort({ timestamp: -1 }).session(options.session || null);
};

const applyMovementLogic = async (data, options = {}) => {
	const { session = null } = options;
	const inventory = await Inventory.findById(data.inventoryID).session(session);
	if (!inventory) {
		throw new NotFoundError('Inventory item not found');
	}

	const movementType = data.movementType;
	const quantityChange = Number(data.quantityChange);
	if (!Number.isFinite(quantityChange) || quantityChange === 0) {
		throw new BadRequestError('quantityChange must be a non-zero number');
	}

	if (movementType === 'remove' || movementType === 'distribute') {
		if (inventory.quantity < Math.abs(quantityChange)) {
			throw new BadRequestError('Insufficient inventory quantity for movement');
		}
		inventory.quantity -= Math.abs(quantityChange);
	} else {
		inventory.quantity += Math.abs(quantityChange);
	}

	inventory.lastMovementDate = new Date();
	await inventory.save({ session });

	const movement = await createMovement(
		{
			inventoryID: data.inventoryID,
			staffID: data.staffID,
			movementType,
			quantityChange: movementType === 'remove' || movementType === 'distribute' ? -Math.abs(quantityChange) : Math.abs(quantityChange),
			timestamp: data.timestamp || new Date(),
			notes: data.notes || '',
		},
		{ session }
	);

	return movement;
};

module.exports = {
	createMovement,
	fetchMovements,
	applyMovementLogic,
	// Backward compatibility
	create: createMovement,
	list: fetchMovements,
	getById: async (id) => InventoryMovement.findById(id),
	updateById: async (id, data) => InventoryMovement.findByIdAndUpdate(id, data, { new: true, runValidators: true }),
	deleteById: async (id) => InventoryMovement.findByIdAndDelete(id),
};
