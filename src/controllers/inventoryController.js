const inventoryService = require('../services/inventoryService');
// تم تصحيح المسار هنا ليخرج من الـ controllers ويدخل للـ services
const createCrudService = require('../services/crudServiceFactory');
const { parsePagination } = require('../utils/pagination');

const normalizeQuery = (query = {}) => ({
  ...query,
  minQuantity: query.minQuantity !== undefined ? Number(query.minQuantity) : query.minQuantity,
});

const getInventory = async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query || {}, { defaultLimit: 20, maxLimit: 100 });
    const data = await inventoryService.fetchInventory(normalizeQuery(req.query || {}), { session: req.mongoSession || null, ...(pagination.hasPagination ? pagination : {}) });
    return res.status(200).json({ success: true, count: data.length, page: pagination.hasPagination ? pagination.page : undefined, limit: pagination.hasPagination ? pagination.limit : undefined, data });
  } catch (error) {
    return next(error);
  }
};

const filterInventory = async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query || {}, { defaultLimit: 20, maxLimit: 100 });
    const data = await inventoryService.filterInventoryLogic(normalizeQuery(req.query || {}), { session: req.mongoSession || null, ...(pagination.hasPagination ? pagination : {}) });
    return res.status(200).json({ success: true, count: data.length, page: pagination.hasPagination ? pagination.page : undefined, limit: pagination.hasPagination ? pagination.limit : undefined, data });
  } catch (error) {
    return next(error);
  }
};

const getLowStock = async (req, res, next) => {
  try {
    const data = await inventoryService.getLowStockItems({ session: req.mongoSession || null });
    return res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    return next(error);
  }
};

const createInventory = async (req, res, next) => {
  try {
    const data = await inventoryService.createInventoryItem(req.body, { session: req.mongoSession || null });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

const updateInventory = async (req, res, next) => {
  try {
    const data = await inventoryService.updateInventoryItem(req.params.id, req.body, { session: req.mongoSession || null });
    if (!data) {
      return res.status(404).json({ success: false, message: 'Inventory not found' });
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getInventory,
  filterInventory,
  getLowStock,
  createInventory,
  updateInventory,
};
