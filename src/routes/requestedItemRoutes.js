const express = require('express');
const requestedItemController = require('../controllers/requestedItemController');
const authMW = require('../middlewares/authMW');
const checkRoleMW = require('../middlewares/checkRoleMW');
const vettingStatusMW = require('../middlewares/vettingStatusMW');
const transactionMW = require('../middlewares/transactionMW');
const validateSchema = require('../middlewares/schemaValidatorMW');
const requestedItemValidate = require('../utils/requestedItemValidate');
const { PERMISSIONS } = require('../middlewares/checkRoleMW');

const router = express.Router();
const accessMiddleware = [authMW, checkRoleMW(PERMISSIONS.REQUEST_AID, PERMISSIONS.MANAGE_REQUESTED_ITEMS), vettingStatusMW()];

router.post('/', accessMiddleware, transactionMW, validateSchema(requestedItemValidate), requestedItemController.createRequestedItem);
router.get('/:id', accessMiddleware, requestedItemController.getRequestedItem);

module.exports = router;