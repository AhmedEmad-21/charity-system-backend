const donationReqService = require('../services/donationReqService');

const setAuditEntry = (req, action, payload) => {
	req.res.locals.auditEntry = {
		eventType: `donation_request_${action}`,
		status: payload.status,
		before: payload.before,
		after: payload.after,
		metadata: payload.metadata || {},
	};
};

const createDonation = async (req, res, next) => {
	try {
		const payload = {
			...req.body,
			donorID: req.user?.id || req.body?.donorID,
		};

		const data = await donationReqService.createDonationRequest(payload, { session: req.mongoSession || null });
		setAuditEntry(req, 'created', {
			status: 'success',
			after: data,
			metadata: { actorUserID: req.user?.id || null },
		});
		return res.status(201).json({ success: true, data });
	} catch (error) {
		setAuditEntry(req, 'created', {
			status: 'failed',
			before: null,
			after: req.body,
			error,
			metadata: { actorUserID: req.user?.id || null },
		});
		return next(error);
	}
};

const getMyDonations = async (req, res, next) => {
	try {
		const data = await donationReqService.fetchUserDonations(req.user?.id);
		return res.status(200).json({ success: true, count: data.length, data });
	} catch (error) {
		return next(error);
	}
};

const getDonationById = async (req, res, next) => {
	try {
		const data = await donationReqService.fetchDonationById(req.params.id);
		if (!data) {
			return res.status(404).json({ success: false, message: 'DonationReq not found' });
		}

		const requesterId = String(req.user?.id || '');
		const requesterRole = String(req.user?.role || '');
		if (requesterRole !== 'Staff' && requesterRole !== 'Admin' && String(data.donorID) !== requesterId) {
			return res.status(403).json({ success: false, message: 'Forbidden: insufficient permission' });
		}

		return res.status(200).json({ success: true, data });
	} catch (error) {
		return next(error);
	}
};

const getAllDonations = async (req, res, next) => {
	try {
		const data = await donationReqService.fetchAllDonations();
		return res.status(200).json({ success: true, count: data.length, data });
	} catch (error) {
		return next(error);
	}
};

const updateDonationStatus = async (req, res, next) => {
	try {
		const { id } = req.params;
		const { status } = req.body;
		const before = await donationReqService.fetchDonationById(id);
		const updated = await donationReqService.updateStatus(id, { status }, { session: req.mongoSession || null });
		if (!updated) {
			return res.status(404).json({ success: false, message: 'DonationReq not found' });
		}

		setAuditEntry(req, 'status_updated', {
			status: 'success',
			before,
			after: updated,
			metadata: { actorUserID: req.user?.id || req.user?._id || req.user?.userId || null },
		});

		return res.status(200).json({ success: true, data: updated });
	} catch (error) {
		setAuditEntry(req, 'status_updated', {
			status: 'failed',
			before: null,
			after: { id: req.params.id, status: req.body?.status },
			error,
			metadata: { actorUserID: req.user?.id || req.user?._id || req.user?.userId || null },
		});
		return next(error);
	}
};

module.exports = {
	createDonation,
	getMyDonations,
	getDonationById,
	getAllDonations,
	updateDonationStatus,
};
