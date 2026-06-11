const express = require('express');
const itemController = require('../controllers/itemController');
const authMW = require('../middlewares/authMW');
const checkRoleMW = require('../middlewares/checkRoleMW');
const itemValidate = require('../utils/itemValidate');
const transactionMW = require('../middlewares/transactionMW');
const validateSchema = require('../middlewares/schemaValidatorMW');
const { PERMISSIONS } = require('../middlewares/checkRoleMW');

const router = express.Router();

router.use(authMW, checkRoleMW(PERMISSIONS.MANAGE_ITEMS));
router.post('/', transactionMW, validateSchema(itemValidate), itemController.createItem);
router.get('/', itemController.getAllItems);
router.get('/:id', itemController.getItem);
router.put('/:id', transactionMW, validateSchema(itemValidate), itemController.updateItem);
router.delete('/:id', transactionMW, itemController.deleteItem);

module.exports = router;
