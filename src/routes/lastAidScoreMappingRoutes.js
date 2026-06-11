const express = require('express');
const lastAidScoreMappingController = require('../controllers/lastAidScoreMappingController');
const authMW = require('../middlewares/authMW');
const checkRoleMW = require('../middlewares/checkRoleMW');
const validateSchema = require('../middlewares/schemaValidatorMW');
const lastAidScoreMappingValidate = require('../utils/lastAidScoreMappingValidate');
const { PERMISSIONS } = require('../middlewares/checkRoleMW');

const router = express.Router();

router.use(authMW, checkRoleMW(PERMISSIONS.MANAGE_MAPPING_RULES));
router.post('/', validateSchema(lastAidScoreMappingValidate), lastAidScoreMappingController.createMapping);
router.get('/', lastAidScoreMappingController.getMappings);
router.put('/:id', validateSchema(lastAidScoreMappingValidate), lastAidScoreMappingController.updateMapping);
router.delete('/:id', lastAidScoreMappingController.deleteMapping);

module.exports = router;