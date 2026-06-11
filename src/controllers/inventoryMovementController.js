const inventoryMovementService = require('../services/inventoryMovementService');

const moveInventory = async (req, res, next) => {
	try {
		const data = await inventoryMovementService.applyMovementLogic(req.body, { session: req.mongoSession || null });
		return res.status(201).json({ success: true, data });
	} catch (error) {
		return next(error);
	}
};

const getMovements = async (req, res, next) => {
	try {
		const data = await inventoryMovementService.fetchMovements(req.query || {}, { session: req.mongoSession || null });
		return res.status(200).json({ success: true, count: data.length, data });
	} catch (error) {
		return next(error);
	}
};

module.exports = {
	moveInventory,
	getMovements,
};
