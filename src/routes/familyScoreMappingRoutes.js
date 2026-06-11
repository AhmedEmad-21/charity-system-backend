const express = require('express');
const familyScoreMappingController = require('../controllers/familyScoreMappingController');
const authMW = require('../middlewares/authMW');
const checkRoleMW = require('../middlewares/checkRoleMW');
const familyScoreMappingValidate = require('../utils/familyScoreMappingValidate');
const validateSchema = require('../middlewares/schemaValidatorMW');
const { PERMISSIONS } = require('../middlewares/checkRoleMW');

const router = express.Router();

router.use(authMW, checkRoleMW(PERMISSIONS.MANAGE_MAPPING_RULES));
router.post('/', validateSchema(familyScoreMappingValidate), familyScoreMappingController.createMapping);
router.get('/', familyScoreMappingController.getMappings);
router.put('/:id', validateSchema(familyScoreMappingValidate), familyScoreMappingController.updateMapping);
router.delete('/:id', familyScoreMappingController.deleteMapping);

module.exports = router;
