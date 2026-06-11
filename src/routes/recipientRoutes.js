const express = require('express');
const recipientRequestController = require('../controllers/recipientRequestController');
const authMW = require('../middlewares/authMW');
const checkRoleMW = require('../middlewares/checkRoleMW');
const vettingStatusMW = require('../middlewares/vettingStatusMW');
const transactionMW = require('../middlewares/transactionMW');
const idempotencyMW = require('../middlewares/idempotencyMW');
const validateSchema = require('../middlewares/schemaValidatorMW');
const recipientRequestValidate = require('../utils/recipientRequestValidate');
const { recipientRequestLimiter } = require('../middlewares/rateLimiterMW');
const { PERMISSIONS } = require('../middlewares/checkRoleMW');

const router = express.Router();

const recipientOnly = [authMW, checkRoleMW(PERMISSIONS.REQUEST_AID), vettingStatusMW()];
const staffOnly = [authMW, checkRoleMW(PERMISSIONS.APPROVE_RECIPIENT_REQUEST, PERMISSIONS.FULFILL_RECIPIENT_REQUEST)];

const injectRecipientUserID = (req, res, next) => {
	req.body = {
		...req.body,
		recipientUserID: req.user?.id || req.user?._id || req.user?.userId,
	};
	return next();
};

const reviewSchema = {
	body: {
		type: 'object',
		additionalProperties: false,
		required: ['status'],
		properties: {
			status: { enum: ['approved', 'rejected', 'fulfilled'] },
		},
	},
};

router.post('/request', recipientRequestLimiter, recipientOnly, idempotencyMW, injectRecipientUserID, validateSchema(recipientRequestValidate), transactionMW, recipientRequestController.createRequest);
router.get('/my-requests', recipientOnly, recipientRequestController.getMyRequests);
router.get('/requests/:id', authMW, vettingStatusMW(), checkRoleMW(PERMISSIONS.REQUEST_AID, PERMISSIONS.APPROVE_RECIPIENT_REQUEST, PERMISSIONS.FULFILL_RECIPIENT_REQUEST), recipientRequestController.getRequestById);
router.get('/requests', staffOnly, recipientRequestController.getAllRequests);
router.put('/review/:id', staffOnly, transactionMW, validateSchema(reviewSchema), recipientRequestController.reviewRequest);
router.get('/available-items', recipientOnly, recipientRequestController.getAvailableItems);
router.get('/eligible-items', recipientOnly, recipientRequestController.getEligibleItems);
router.get('/recommendations', recipientOnly, recipientRequestController.getRecommendations);

// Backward-compatible aliases for older callers.
router.patch('/:id/approve', staffOnly, transactionMW, validateSchema(reviewSchema), recipientRequestController.approve);
router.patch('/:id/fulfill', staffOnly, transactionMW, validateSchema(reviewSchema), recipientRequestController.fulfill);

module.exports = router;
