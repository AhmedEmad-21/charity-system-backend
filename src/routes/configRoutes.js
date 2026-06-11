const express = require('express');
const createCrudRouter = require('./crudRouteFactory');
const configController = require('../controllers/configController');
const authMW = require('../middlewares/authMW');
const checkRoleMW = require('../middlewares/checkRoleMW');
const configValidate = require('../utils/configValidate');
const transactionMW = require('../middlewares/transactionMW');
const { PERMISSIONS } = require('../middlewares/checkRoleMW');

const router = express.Router();

router.get('/dashboard', authMW, checkRoleMW(PERMISSIONS.VIEW_DASHBOARD), configController.dashboard);
router.get('/dashboard/stats', authMW, checkRoleMW(PERMISSIONS.VIEW_DASHBOARD), configController.getStats);
router.get('/dashboard/vetting-summary', authMW, checkRoleMW(PERMISSIONS.VIEW_DASHBOARD), configController.getVettingSummary);
router.get('/dashboard/requests-summary', authMW, checkRoleMW(PERMISSIONS.VIEW_DASHBOARD), configController.getRequestsSummary);

router.post('/system/run-monthly-reset', authMW, checkRoleMW(PERMISSIONS.MANAGE_CONFIG), transactionMW, configController.runMonthlyReset);
router.post('/system/recalculate-priorities', authMW, checkRoleMW(PERMISSIONS.MANAGE_CONFIG), transactionMW, configController.recalculatePriorities);
router.post('/allocation/run', authMW, checkRoleMW(PERMISSIONS.MANAGE_CONFIG), transactionMW, configController.runAllocation);

router.use(createCrudRouter(configController, {
	middlewares: [authMW, checkRoleMW(PERMISSIONS.MANAGE_CONFIG)],
	methodMiddlewares: {
		create: [transactionMW],
		updateById: [transactionMW],
		deleteById: [transactionMW],
	},
	createSchema: configValidate,
	updateSchema: configValidate,
}));

module.exports = router;
