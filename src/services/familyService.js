const Family = require('../models/Family');
const createCrudService = require('./crudServiceFactory');

module.exports = {
  ...createCrudService(Family),
};
