const express = require('express');
const inventoryMovementController = require('../controllers/inventoryMovementController');
const authMW = require('../middlewares/authMW');
const checkRoleMW = require('../middlewares/checkRoleMW');
const inventoryMovementValidate = require('../utils/inventoryMovementValidate');
const validateSchema = require('../middlewares/schemaValidatorMW');
const transactionMW = require('../middlewares/transactionMW');
const { PERMISSIONS } = require('../middlewares/checkRoleMW');

const router = express.Router();

router.use(authMW, checkRoleMW(PERMISSIONS.MANAGE_INVENTORY_MOVEMENTS));
router.post('/move', transactionMW, validateSchema(inventoryMovementValidate), inventoryMovementController.moveInventory);
router.get('/movements', inventoryMovementController.getMovements);

module.exports = router;
