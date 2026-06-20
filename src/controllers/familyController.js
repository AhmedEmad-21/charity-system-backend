const createCrudController = require('./crudControllerFactory');
const familyService = require('../services/familyService');

module.exports = createCrudController(familyService, 'Family');
