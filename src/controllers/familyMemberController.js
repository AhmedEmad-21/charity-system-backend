const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const { BadRequestError, NotFoundError } = require('../errors/appErrors');
const familyMemberService = require('../services/familyMemberService');

const setAuditEntry = (req, entityName, action, payload) => {
  if (!req?.res) return;
  req.res.locals.auditEntry = {
    eventType: `${String(entityName).toLowerCase()}_${action}`,
    status: payload.status,
    before: payload.before,
    after: payload.after,
    metadata: payload.metadata || {},
  };
};

const validateObjectId = (id, label = 'id') => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new BadRequestError(`Invalid ${label} format`);
  }
};

module.exports = {
  create: asyncHandler(async (req, res) => {
    const { familyId } = req.params;
    validateObjectId(familyId, 'familyId');

    const created = await familyMemberService.createForFamily(familyId, req.body, {
      session: req.mongoSession || null,
    });

    setAuditEntry(req, 'FamilyMember', 'created', {
      status: 'success',
      after: created,
      metadata: { actorUserID: req.user?.id || req.user?._id || null },
    });

    return res.status(201).json({ success: true, data: created });
  }),

  list: asyncHandler(async (req, res) => {
    const { familyId } = req.params;
    validateObjectId(familyId, 'familyId');

    const data = await familyMemberService.listByFamily(familyId, req.query || {}, {
      session: req.mongoSession || null,
    });

    return res.status(200).json({ success: true, count: data.length, data });
  }),

  getById: asyncHandler(async (req, res) => {
    const { familyId, id } = req.params;
    validateObjectId(familyId, 'familyId');
    validateObjectId(id, 'memberId');

    const data = await familyMemberService.getByFamilyMember(familyId, id, {
      session: req.mongoSession || null,
    });

    if (!data) {
      throw new NotFoundError('FamilyMember not found on this family');
    }

    return res.status(200).json({ success: true, data });
  }),

  updateById: asyncHandler(async (req, res) => {
    const { familyId, id } = req.params;
    validateObjectId(familyId, 'familyId');
    validateObjectId(id, 'memberId');

    const before = await familyMemberService.getByFamilyMember(familyId, id, {
      session: req.mongoSession || null,
    });
    if (!before) {
      throw new NotFoundError('FamilyMember not found on this family');
    }

    const updated = await familyMemberService.updateByFamilyMember(familyId, id, req.body, {
      session: req.mongoSession || null,
    });

    setAuditEntry(req, 'FamilyMember', 'updated', {
      status: 'success',
      before,
      after: updated,
      metadata: { actorUserID: req.user?.id || req.user?._id || null },
    });

    return res.status(200).json({ success: true, data: updated });
  }),

  deleteById: asyncHandler(async (req, res) => {
    const { familyId, id } = req.params;
    validateObjectId(familyId, 'familyId');
    validateObjectId(id, 'memberId');

    const before = await familyMemberService.getByFamilyMember(familyId, id, {
      session: req.mongoSession || null,
    });
    if (!before) {
      throw new NotFoundError('FamilyMember not found on this family');
    }

    const deleted = await familyMemberService.deleteByFamilyMember(familyId, id, {
      session: req.mongoSession || null,
    });

    setAuditEntry(req, 'FamilyMember', 'deleted', {
      status: 'success',
      before,
      after: null,
      metadata: { actorUserID: req.user?.id || req.user?._id || null },
    });

    return res.status(200).json({ success: true, message: 'FamilyMember deleted successfully' });
  }),
};
