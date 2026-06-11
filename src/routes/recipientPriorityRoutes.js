const express = require('express');
const priorityController = require('../controllers/priorityController');
const authMW = require('../middlewares/authMW');
const checkRoleMW = require('../middlewares/checkRoleMW');
const { PERMISSIONS } = require('../middlewares/checkRoleMW');

const router = express.Router();

router.get('/top-priority', authMW, checkRoleMW(PERMISSIONS.MANAGE_VETTING), priorityController.getTopPriorityUsers);

module.exports = router;