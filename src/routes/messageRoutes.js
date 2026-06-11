const express = require('express');
const messageController = require('../controllers/messageController');
const authMW = require('../middlewares/authMW');
const checkRoleMW = require('../middlewares/checkRoleMW');
const { PERMISSIONS } = require('../middlewares/checkRoleMW');

const router = express.Router();

router.use(authMW);

router.get('/me', checkRoleMW(PERMISSIONS.VIEW_MESSAGES, PERMISSIONS.MANAGE_MESSAGES), messageController.getMyMessages);
router.get('/', checkRoleMW(PERMISSIONS.MANAGE_MESSAGES), messageController.getAllMessages);
router.put('/read/:id', checkRoleMW(PERMISSIONS.VIEW_MESSAGES, PERMISSIONS.MANAGE_MESSAGES), messageController.markAsRead);

module.exports = router;
