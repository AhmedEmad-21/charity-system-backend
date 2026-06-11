const express = require('express');
const healthScoreMappingController = require('../controllers/healthScoreMappingController');
const authMW = require('../middlewares/authMW');
const checkRoleMW = require('../middlewares/checkRoleMW');
const healthScoreMappingValidate = require('../utils/healthScoreMappingValidate');
const validateSchema = require('../middlewares/schemaValidatorMW');
const { PERMISSIONS } = require('../middlewares/checkRoleMW');

const router = express.Router();

router.use(authMW, checkRoleMW(PERMISSIONS.MANAGE_MAPPING_RULES));
router.post('/', validateSchema(healthScoreMappingValidate), healthScoreMappingController.createMapping);
router.get('/', healthScoreMappingController.getMappings);
router.put('/:id', validateSchema(healthScoreMappingValidate), healthScoreMappingController.updateMapping);
router.delete('/:id', healthScoreMappingController.deleteMapping);

module.exports = router;
