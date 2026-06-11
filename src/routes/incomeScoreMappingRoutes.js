const express = require('express');
const incomeScoreMappingController = require('../controllers/incomeScoreMappingController');
const authMW = require('../middlewares/authMW');
const checkRoleMW = require('../middlewares/checkRoleMW');
const incomeScoreMappingValidate = require('../utils/incomeScoreMappingValidate');
const validateSchema = require('../middlewares/schemaValidatorMW');
const { PERMISSIONS } = require('../middlewares/checkRoleMW');

const router = express.Router();

router.use(authMW, checkRoleMW(PERMISSIONS.MANAGE_MAPPING_RULES));
router.post('/', validateSchema(incomeScoreMappingValidate), incomeScoreMappingController.createMapping);
router.get('/', incomeScoreMappingController.getMappings);
router.put('/:id', validateSchema(incomeScoreMappingValidate), incomeScoreMappingController.updateMapping);
router.delete('/:id', incomeScoreMappingController.deleteMapping);

module.exports = router;
