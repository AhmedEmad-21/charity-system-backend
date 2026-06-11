const express = require('express');
const appController = require('../controllers/appController');
const authMW = require('../middlewares/authMW');
const checkRoleMW = require('../middlewares/checkRoleMW');
const { PERMISSIONS } = require('../middlewares/checkRoleMW');

const router = express.Router();

router.get('/', appController.root);

router.get('/health', appController.health);

router.get('/status', authMW, checkRoleMW(PERMISSIONS.MANAGE_CONFIG, PERMISSIONS.VIEW_DASHBOARD), appController.status);

router.get('/system/status', authMW, checkRoleMW(PERMISSIONS.MANAGE_CONFIG, PERMISSIONS.VIEW_DASHBOARD), appController.systemStatus);

module.exports = router;
