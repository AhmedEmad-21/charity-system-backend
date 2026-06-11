const itemService = require('../services/itemService');

const createItem = async (req, res, next) => {
	try {
		const data = await itemService.createItemLogic(req.body, { session: req.mongoSession || null });
		return res.status(201).json({ success: true, data });
	} catch (error) {
		return next(error);
	}
};

const getItem = async (req, res, next) => {
	try {
		const data = await itemService.fetchItem(req.params.id, { session: req.mongoSession || null });
		if (!data) {
			return res.status(404).json({ success: false, message: 'Item not found' });
		}

		return res.status(200).json({ success: true, data });
	} catch (error) {
		return next(error);
	}
};

const getAllItems = async (req, res, next) => {
	try {
		const data = await itemService.fetchItems(req.query || {}, { session: req.mongoSession || null });
		return res.status(200).json({ success: true, count: data.length, data });
	} catch (error) {
		return next(error);
	}
};

const updateItem = async (req, res, next) => {
	try {
		const data = await itemService.updateItemLogic(req.params.id, req.body, { session: req.mongoSession || null });
		if (!data) {
			return res.status(404).json({ success: false, message: 'Item not found' });
		}

		return res.status(200).json({ success: true, data });
	} catch (error) {
		return next(error);
	}
};

const deleteItem = async (req, res, next) => {
	try {
		const data = await itemService.deleteItemLogic(req.params.id, { session: req.mongoSession || null });
		if (!data) {
			return res.status(404).json({ success: false, message: 'Item not found' });
		}

		return res.status(200).json({ success: true, message: 'Item deleted successfully', data });
	} catch (error) {
		return next(error);
	}
};

module.exports = {
	createItem,
	getItem,
	getAllItems,
	updateItem,
	deleteItem,
};
