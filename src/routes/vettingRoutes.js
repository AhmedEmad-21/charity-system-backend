const express = require('express');
const vettingRequestController = require('../controllers/vettingRequestController');
const authMW = require('../middlewares/authMW');
const checkRoleMW = require('../middlewares/checkRoleMW');
const vettingRequestValidate = require('../utils/vettingRequestValidate');
const vettingDocumentUploadMW = require('../middlewares/vettingDocumentUploadMW');
const transactionMW = require('../middlewares/transactionMW');
const validateSchema = require('../middlewares/schemaValidatorMW');
const { PERMISSIONS } = require('../middlewares/checkRoleMW');

const router = express.Router();

router.post(
	'/request',
	authMW,
	checkRoleMW(PERMISSIONS.REQUEST_VETTING),
	vettingDocumentUploadMW,
	transactionMW,
	validateSchema(vettingRequestValidate),
	vettingRequestController.createVettingRequest
);

router.get(
	'/my',
	authMW,
	checkRoleMW(PERMISSIONS.REQUEST_VETTING, PERMISSIONS.MANAGE_VETTING),
	vettingRequestController.getMyVetting
);

router.get(
	'/pending',
	authMW,
	checkRoleMW(PERMISSIONS.MANAGE_VETTING),
	vettingRequestController.getPendingRequests
);

router.get(
	'/',
	authMW,
	checkRoleMW(PERMISSIONS.MANAGE_VETTING),
	vettingRequestController.getVettingByStatus
);

router.get(
	'/:id',
	authMW,
	checkRoleMW(PERMISSIONS.REQUEST_VETTING, PERMISSIONS.MANAGE_VETTING),
	vettingRequestController.getVettingById
);

router.put(
	'/approve/:id',
	authMW,
	checkRoleMW(PERMISSIONS.MANAGE_VETTING),
	transactionMW,
	vettingRequestController.approveVetting
);

router.put(
	'/reject/:id',
	authMW,
	checkRoleMW(PERMISSIONS.MANAGE_VETTING),
	transactionMW,
	vettingRequestController.rejectVetting
);

module.exports = router;
