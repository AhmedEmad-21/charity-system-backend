const express = require('express');
const validateSchema = require('../middlewares/schemaValidatorMW');

const createCrudRouter = (controller, options = {}) => {
  const router = express.Router();

  const middlewares = options.middlewares || [];
  const methodMiddlewares = options.methodMiddlewares || {};
  const createValidation = options.createSchema ? [validateSchema(options.createSchema)] : [];
  const updateValidation = options.updateSchema ? [validateSchema(options.updateSchema)] : [];

  const withMiddlewares = [...middlewares];
  const withMethodMiddlewares = (methodName) => [...withMiddlewares, ...(methodMiddlewares[methodName] || [])];

  router.post('/', ...withMethodMiddlewares('create'), ...createValidation, controller.create);
  router.get('/', ...withMethodMiddlewares('list'), controller.list);
  router.get('/:id', ...withMethodMiddlewares('getById'), controller.getById);
  router.put('/:id', ...withMethodMiddlewares('updateById'), ...updateValidation, controller.updateById);
  router.delete('/:id', ...withMethodMiddlewares('deleteById'), controller.deleteById);

  return router;
};

module.exports = createCrudRouter;
