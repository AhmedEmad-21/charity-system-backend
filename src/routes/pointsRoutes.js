const express = require('express');
const pointsController = require('../controllers/pointsController');
const authMW = require('../middlewares/authMW');
const checkRoleMW = require('../middlewares/checkRoleMW');
const { PERMISSIONS } = require('../middlewares/checkRoleMW');

const router = express.Router();

router.use(authMW);

router.get(
	'/me',
	checkRoleMW(PERMISSIONS.REQUEST_AID, PERMISSIONS.VIEW_TRANSACTIONS, PERMISSIONS.MANAGE_TRANSACTIONS),
	pointsController.getMyPoints
);

router.get(
	'/history',
	checkRoleMW(PERMISSIONS.REQUEST_AID, PERMISSIONS.VIEW_TRANSACTIONS, PERMISSIONS.MANAGE_TRANSACTIONS),
	pointsController.getPointsHistory
);

router.get(
	'/:userId',
	checkRoleMW(PERMISSIONS.VIEW_TRANSACTIONS, PERMISSIONS.MANAGE_TRANSACTIONS),
	pointsController.getUserPoints
);

module.exports = router;
