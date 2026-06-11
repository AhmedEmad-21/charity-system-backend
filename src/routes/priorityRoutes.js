const express = require('express');
const priorityController = require('../controllers/priorityController');
const authMW = require('../middlewares/authMW');
const checkRoleMW = require('../middlewares/checkRoleMW');
const transactionMW = require('../middlewares/transactionMW');
const { PERMISSIONS } = require('../middlewares/checkRoleMW');

const router = express.Router();

router.get('/ranked', authMW, checkRoleMW(PERMISSIONS.MANAGE_VETTING), priorityController.getRankedUsers);
router.get('/:userId', authMW, priorityController.getUserPriority);
router.post('/recalculate/:userId', authMW, checkRoleMW(PERMISSIONS.MANAGE_VETTING), transactionMW, priorityController.recalculateUser);
router.post('/recalculate-all', authMW, checkRoleMW(PERMISSIONS.MANAGE_VETTING), transactionMW, priorityController.recalculateAll);

module.exports = router;