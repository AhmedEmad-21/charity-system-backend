const FamilyMember = require('../models/FamilyMember');
const createCrudService = require('./crudServiceFactory');

const base = createCrudService(FamilyMember);

module.exports = {
  ...base,

  async listByFamily(familyId, filter = {}, options = {}) {
    return base.list({ family_id: familyId, ...filter }, options);
  },

  async getByFamilyMember(familyId, memberId, options = {}) {
    const member = await base.getById(memberId, options);
    if (!member || String(member.family_id) !== familyId) {
      return null;
    }
    return member;
  },

  async updateByFamilyMember(familyId, memberId, data, options = {}) {
    const member = await this.getByFamilyMember(familyId, memberId, options);
    if (!member) return null;
    return base.updateById(memberId, data, options);
  },

  async deleteByFamilyMember(familyId, memberId, options = {}) {
    const member = await this.getByFamilyMember(familyId, memberId, options);
    if (!member) return null;
    return base.deleteById(memberId, options);
  },

  async createForFamily(familyId, data, options = {}) {
    return base.create({ ...data, family_id: familyId }, options);
  },
};
