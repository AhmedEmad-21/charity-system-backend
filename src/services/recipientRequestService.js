const mongoose = require("mongoose");
const RecipientRequest = require("../models/recipientRequestModel");
const RequestedItem = require("../models/requestedItemModel");
const Inventory = require("../models/inventoryModel");
const inventoryService = require("./inventoryService");
const createCrudService = require("./crudServiceFactory");
const { NotFoundError, BadRequestError } = require("../errors/appErrors");

const baseService = createCrudService(RecipientRequest);

const requestPopulation = [
  { path: "recipientUserID", select: "name email role vettingStatus" },
  { path: "staffReviewerID", select: "name email role" },
];

const toObject = (value) =>
  !value
    ? null
    : typeof value.toObject === "function"
    ? value.toObject()
    : value;

// دالة لجلب المنتجات المتاحة
const calculateAvailableItems = async (options = {}) => {
  const { session = null } = options;
  const query = Inventory.find({ quantity: { $gt: 0 } }).lean();
  if (session && typeof session.inTransaction === "function")
    query.session(session);
  return await query.exec();
};

// دالة جديدة لجلب طلبات مستخدم معين (وهي التي كانت مفقودة)
const fetchUserRequests = async (recipientUserID) => {
  return await RecipientRequest.find({ recipientUserID })
    .populate(requestPopulation)
    .sort({ createdAt: -1 })
    .lean();
};

const attachRequestedItems = async (request, session = null) => {
  if (!request) return null;
  const query = RequestedItem.find({ recipientRequestID: request._id })
    .populate(
      "inventoryID",
      "itemName category quantity itemPointsCost monthlyLimit itemCondition storageLocation",
    )
    .lean();

  if (session && typeof session.inTransaction === "function")
    query.session(session);

  const requestedItems = await query.exec();
  const data = toObject(request);
  data.requestedItems = requestedItems;
  data.requestedItemCount = requestedItems.length;
  return data;
};

const fetchRequestById = async (id, session = null) => {
  const query = RecipientRequest.findById(id).populate(requestPopulation);
  if (session && typeof session.inTransaction === "function")
    query.session(session);
  const request = await query.exec();
  return attachRequestedItems(request, session);
};

const createRecipientRequest = async (data, options = {}) => {
  return baseService.create(data, options);
};

const reviewRequestLogic = async (id, data = {}, options = {}) => {
  const { session: externalSession = null } = options;
  const status = String(data.status || "")
    .trim()
    .toLowerCase();
  const session = externalSession || (await mongoose.startSession());
  const ownsSession = !externalSession;

  try {
    if (ownsSession) session.startTransaction();
    const request = await RecipientRequest.findById(id).session(session);
    if (!request) throw new NotFoundError("Request not found");

    if (status === "fulfilled") {
      if (request.status !== "approved")
        throw new BadRequestError("Only approved requests can be fulfilled");
      const items = await RequestedItem.find({
        recipientRequestID: id,
      }).session(session);
      for (const item of items) {
        await inventoryService.deductItem(
          item.inventoryID,
          item.quantityRequested,
          {
            staffID: data.staffID,
            notes: `Fulfillment for Request ${id}`,
            session,
          },
        );
      }
    }
    const updatedRequest = await RecipientRequest.findByIdAndUpdate(
      id,
      { status, staffReviewerID: data.staffReviewerID },
      { new: true, runValidators: true, session },
    );
    if (ownsSession) await session.commitTransaction();
    return await fetchRequestById(updatedRequest._id, null);
  } catch (error) {
    if (ownsSession) await session.abortTransaction();
    throw error;
  } finally {
    if (ownsSession) session.endSession();
  }
};

module.exports = {
  ...baseService,
  createRecipientRequest,
  fetchRequestById,
  reviewRequestLogic,
  calculateAvailableItems,
  fetchUserRequests, // تمت إضافة الدالة هنا
  async updateById(id, data, options = {}) {
    if (["approved", "rejected", "fulfilled"].includes(data?.status))
      return reviewRequestLogic(id, data, options);
    return baseService.updateById(id, data, options);
  },
};
