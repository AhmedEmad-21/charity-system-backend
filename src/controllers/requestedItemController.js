const requestedItemService = require('../services/requestedItemService');

const getActor = (req) => ({
	actorUserID: req.user?.id || req.user?._id || req.user?.userId || null,
	actorRole: req.user?.role || null,
});

const respond = (res, data, statusCode = 200) => res.status(statusCode).json({ success: true, data });

module.exports = {
	async createRequestedItem(req, res, next) {
		try {
			const data = await requestedItemService.createRequestedItemLogic(
				req.body,
				{ session: req.mongoSession || null, ...getActor(req) }
			);

			return respond(res, data, 201);
		} catch (error) {
			return next(error);
		}
	},

	async getRequestedItem(req, res, next) {
		try {
			const data = await requestedItemService.fetchRequestedItem(req.params.id, {
				session: req.mongoSession || null,
				...getActor(req),
			});

			if (!data) {
				return res.status(404).json({ success: false, message: 'RequestedItem not found' });
			}

			return respond(res, data);
		} catch (error) {
			return next(error);
		}
	},

	// Backward-compatible aliases.
	create: async (req, res, next) => module.exports.createRequestedItem(req, res, next),
	getById: async (req, res, next) => module.exports.getRequestedItem(req, res, next),
};
