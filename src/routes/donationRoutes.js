const express = require('express');
const donationReqController = require('../controllers/donationReqController');
const authMW = require('../middlewares/authMW');
const checkRoleMW = require('../middlewares/checkRoleMW');
const donationReqValidate = require('../utils/donationReqValidate');
const transactionMW = require('../middlewares/transactionMW');
const idempotencyMW = require('../middlewares/idempotencyMW');
const validateSchema = require('../middlewares/schemaValidatorMW');
const { PERMISSIONS } = require('../middlewares/checkRoleMW');

const router = express.Router();

const attachDonorID = (req, res, next) => {
	if (!req.body.donorID && req.user?.id) {
		req.body.donorID = req.user.id;
	}
	return next();
};

router.post('/', authMW, checkRoleMW(PERMISSIONS.CREATE_DONATION, PERMISSIONS.MANAGE_DONATION), idempotencyMW, attachDonorID, transactionMW, validateSchema(donationReqValidate), donationReqController.createDonation);
router.get('/my', authMW, donationReqController.getMyDonations);
router.get('/', authMW, checkRoleMW(PERMISSIONS.MANAGE_DONATION), donationReqController.getAllDonations);
router.get('/:id', authMW, donationReqController.getDonationById);
router.put('/:id/status', authMW, checkRoleMW(PERMISSIONS.MANAGE_DONATION), transactionMW, donationReqController.updateDonationStatus);

module.exports = router;
