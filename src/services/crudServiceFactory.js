const createCrudService = (Model) => ({
  async create(data, options = {}) {
    const { session = null } = options;
    return Model.create([data], session ? { session } : {}).then((rows) => rows[0]);
  },

  async list(filter = {}, options = {}) {
    const {
      session = null,
      select = null,
      sort = { createdAt: -1 },
      page = null,
      limit = null,
      lean = false,
    } = options;

    let query = Model.find(filter).session(session).sort(sort);

    if (select) {
      query = query.select(select);
    }

    if (Number.isFinite(Number(page)) && Number.isFinite(Number(limit)) && Number(page) > 0 && Number(limit) > 0) {
      query = query.skip((Number(page) - 1) * Number(limit)).limit(Number(limit));
    }

    if (lean) {
      query = query.lean();
    }

    return query;
  },

  async getById(id, options = {}) {
    const { session = null } = options;
    return Model.findById(id).session(session);
  },

  async updateById(id, data, options = {}) {
    const { session = null } = options;
    return Model.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
      session,
    });
  },

  async deleteById(id, options = {}) {
    const { session = null } = options;
    return Model.findByIdAndDelete(id, { session });
  },
});

module.exports = createCrudService;
