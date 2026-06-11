const express = require('express');
const transactionController = require('../controllers/transactionController');
const authMW = require('../middlewares/authMW');
const checkRoleMW = require('../middlewares/checkRoleMW');
const transactionValidate = require('../utils/transactionValidate');
const transactionMW = require('../middlewares/transactionMW');
const idempotencyMW = require('../middlewares/idempotencyMW');
const validateSchema = require('../middlewares/schemaValidatorMW');
const { PERMISSIONS } = require('../middlewares/checkRoleMW');

const router = express.Router();

const transactionCreateSchema = {
	body: {
		...transactionValidate,
		required: ['amount', 'paymentMethod'],
		properties: {
			...transactionValidate.properties,
			donorID: { type: ['string', 'null'], pattern: '^[0-9a-fA-F]{24}$' },
		},
	},
};

router.post(
	'/',
	authMW,
	checkRoleMW(PERMISSIONS.CREATE_DONATION, PERMISSIONS.MANAGE_TRANSACTIONS),
	idempotencyMW,
	transactionMW,
	validateSchema(transactionCreateSchema),
	transactionController.createTransaction
);

router.get(
	'/my',
	authMW,
	checkRoleMW(PERMISSIONS.CREATE_DONATION, PERMISSIONS.VIEW_TRANSACTIONS, PERMISSIONS.MANAGE_TRANSACTIONS),
	transactionController.getMyTransactions
);

router.get(
	'/',
	authMW,
	checkRoleMW(PERMISSIONS.MANAGE_TRANSACTIONS),
	transactionController.getAllTransactions
);

module.exports = router;
