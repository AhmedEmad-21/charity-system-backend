const express = require('express');
const inventoryController = require('../controllers/inventoryController');
const authMW = require('../middlewares/authMW');
const checkRoleMW = require('../middlewares/checkRoleMW');
const inventoryValidate = require('../utils/inventoryValidate');
const transactionMW = require('../middlewares/transactionMW');
const validateSchema = require('../middlewares/schemaValidatorMW');
const { PERMISSIONS } = require('../middlewares/checkRoleMW');

const router = express.Router();

// 🔒 1. بنحط السطر هنا (حارس البوابة الرئيسي للمخزن)
// أي راوت مكتوب تحت السطر ده هيتطبق عليه الحماية دي أوتوماتيك
router.use(authMW, checkRoleMW(PERMISSIONS.MANAGE_INVENTORY));

// 🚀 2. الراوتس دي دلوقتي كلها محمية وما تقدرش تتطلب إلا بتوكن الموظف (Staff)
router.get('/low-stock', inventoryController.getLowStock);
router.get('/', inventoryController.getInventory);
router.post('/', transactionMW, validateSchema(inventoryValidate), inventoryController.createInventory);
router.put('/:id', transactionMW, validateSchema(inventoryValidate), inventoryController.updateInventory);

module.exports = router;
