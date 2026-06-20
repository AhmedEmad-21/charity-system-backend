const express = require('express');
const createCrudRouter = require('./crudRouteFactory');
const familyController = require('../controllers/familyController');
const familyMemberController = require('../controllers/familyMemberController');
const authMW = require('../middlewares/authMW');
const checkRoleMW = require('../middlewares/checkRoleMW');
const transactionMW = require('../middlewares/transactionMW');
const { PERMISSIONS } = require('../middlewares/checkRoleMW');

const router = express.Router();

const staffOrAdmin = [authMW, checkRoleMW(PERMISSIONS.MANAGE_VETTING)];

router.use('/:familyId/members/:id', authMW);
router.get('/:familyId/members/:id', familyMemberController.getById);
router.put('/:familyId/members/:id', familyMemberController.updateById);
router.delete('/:familyId/members/:id', familyMemberController.deleteById);

router.use('/:familyId/members', authMW);
router.get('/:familyId/members', familyMemberController.list);
router.post('/:familyId/members', familyMemberController.create);

router.use(createCrudRouter(familyController, {
  middlewares: staffOrAdmin,
}));

module.exports = router;
