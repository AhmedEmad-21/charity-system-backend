const vettingRequestService = require('../services/vettingRequestService');

const createVettingRequest = async (req, res, next) => {
	try {
		const payload = { ...req.body };
		if (!payload.recipientUserID) {
			payload.recipientUserID = req.user?.id;
		}

		const data = await vettingRequestService.createRequest(payload, { session: req.mongoSession || null });
		return res.status(201).json({ success: true, data });
	} catch (error) {
		return next(error);
	}
};

const getMyVetting = async (req, res, next) => {
	try {
		const data = await vettingRequestService.getUserRequest(req.user?.id);
		if (!data) {
			return res.status(404).json({ success: false, message: 'Vetting request not found' });
		}

		return res.status(200).json({ success: true, data });
	} catch (error) {
		return next(error);
	}
};

const getVettingById = async (req, res, next) => {
	try {
		const data = await vettingRequestService.getRequestById(req.params.id);
		if (!data) {
			return res.status(404).json({ success: false, message: 'Vetting request not found' });
		}

		return res.status(200).json({ success: true, data });
	} catch (error) {
		return next(error);
	}
};

const getPendingRequests = async (req, res, next) => {
	try {
		const data = await vettingRequestService.fetchPendingRequests();
		return res.status(200).json({ success: true, count: data.length, data });
	} catch (error) {
		return next(error);
	}
};

const getVettingByStatus = async (req, res, next) => {
	try {
		const status = String(req.query.status || '').trim().toLowerCase();
		if (!status) {
			return res.status(400).json({ success: false, message: 'status query is required' });
		}

		const data = await vettingRequestService.fetchByStatus(status);
		return res.status(200).json({ success: true, count: data.length, data });
	} catch (error) {
		return next(error);
	}
};

const approveVetting = async (req, res, next) => {
	try {
		const data = await vettingRequestService.approveRequest(req.params.id, req.user?.id, {
			session: req.mongoSession || null,
		});

		if (!data) {
			return res.status(404).json({ success: false, message: 'Vetting request not found' });
		}

		return res.status(200).json({ success: true, data });
	} catch (error) {
		return next(error);
	}
};

const rejectVetting = async (req, res, next) => {
	try {
		const data = await vettingRequestService.rejectRequest(
			req.params.id,
			req.user?.id,
			req.body?.notes || '',
			{ session: req.mongoSession || null }
		);

		if (!data) {
			return res.status(404).json({ success: false, message: 'Vetting request not found' });
		}

		return res.status(200).json({ success: true, data });
	} catch (error) {
		return next(error);
	}
};

module.exports = {
	createVettingRequest,
	getMyVetting,
	getVettingById,
	getPendingRequests,
	getVettingByStatus,
	approveVetting,
	rejectVetting,
};
