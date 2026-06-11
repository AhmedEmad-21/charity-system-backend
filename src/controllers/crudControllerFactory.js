const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const { BadRequestError, NotFoundError } = require('../errors/appErrors');

const setAuditEntry = (req, entityName, action, payload) => {
  if (!req?.res) {
    return;
  }

  req.res.locals.auditEntry = {
    eventType: `${String(entityName).toLowerCase()}_${action}`,
    status: payload.status,
    before: payload.before,
    after: payload.after,
    metadata: payload.metadata || {},
  };
};

const createCrudController = (service, entityName) => ({
  create: asyncHandler(async (req, res) => {
      const created = await service.create(req.body, { session: req.mongoSession || null });
      setAuditEntry(req, entityName, 'created', {
      status: 'success',
      after: created,
      metadata: { actorUserID: req.user?.id || req.user?._id || req.user?.userId || null },
    });
      return res.status(201).json({ success: true, data: created });
  }),

  list: asyncHandler(async (req, res) => {
      const data = await service.list(req.query || {}, { session: req.mongoSession || null });
      return res.status(200).json({ success: true, count: data.length, data });
  }),

  getById: asyncHandler(async (req, res) => {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new BadRequestError('Invalid id format');
      }

      const data = await service.getById(id, { session: req.mongoSession || null });
      if (!data) {
        throw new NotFoundError(`${entityName} not found`);
      }

      return res.status(200).json({ success: true, data });
  }),

	updateById: asyncHandler(async (req, res) => {
	      const { id } = req.params;
	      if (!mongoose.Types.ObjectId.isValid(id)) {
	        throw new BadRequestError('Invalid id format');
	      }

	      const before = await service.getById(id, { session: req.mongoSession || null });

	      const updated = await service.updateById(id, req.body, { session: req.mongoSession || null });
	      if (!updated) {
	        throw new NotFoundError(`${entityName} not found`);
	      }

	      setAuditEntry(req, entityName, 'updated', {
			status: 'success',
			before,
			after: updated,
			metadata: { actorUserID: req.user?.id || req.user?._id || req.user?.userId || null },
		});

      return res.status(200).json({ success: true, data: updated });
	}),

	deleteById: asyncHandler(async (req, res) => {
	      const { id } = req.params;
	      if (!mongoose.Types.ObjectId.isValid(id)) {
	        throw new BadRequestError('Invalid id format');
	      }

	      const before = await service.getById(id, { session: req.mongoSession || null });

	      const deleted = await service.deleteById(id, { session: req.mongoSession || null });
	      if (!deleted) {
	        throw new NotFoundError(`${entityName} not found`);
	      }

	      setAuditEntry(req, entityName, 'deleted', {
			status: 'success',
			before,
			after: null,
			metadata: { actorUserID: req.user?.id || req.user?._id || req.user?.userId || null },
		});

      return res.status(200).json({ success: true, message: `${entityName} deleted successfully` });
	}),
});

module.exports = createCrudController;
