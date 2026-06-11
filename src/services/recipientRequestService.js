const mongoose = require("mongoose");
const RecipientRequest = require("../models/recipientRequestModel");
const RequestedItem = require("../models/requestedItemModel");
const RecipientPoints = require("../models/recipientPointsModel");
const RecipientItemQuota = require("../models/recipientItemQuotaModel");
const RecipientPriority = require("../models/recipientPriorityModel");
const PointsTransaction = require("../models/pointsTransactionModel");
const messageService = require("./messageService");
const requestedItemService = require("./requestedItemService");
const inventoryService = require("./inventoryService");
const createCrudService = require("./crudServiceFactory");
const {
  BadRequestError,
  ConflictError,
  NotFoundError,
} = require("../errors/appErrors");
const { parsePagination } = require("../utils/pagination");

const baseService = createCrudService(RecipientRequest);

const isRetryableTransactionError = (error) =>
  Boolean(error?.errorLabels?.includes("TransientTransactionError")) ||
  Boolean(error?.errorLabels?.includes("UnknownTransactionCommitResult")) ||
  error?.code === 112 ||
  String(error?.message || "")
    .toLowerCase()
    .includes("write conflict") ||
  String(error?.message || "").includes(
    "Please retry your operation or multi-document transaction",
  );

const requestPopulation = [
  { path: "recipientUserID", select: "name email role vettingStatus" },
  { path: "staffReviewerID", select: "name email role" },
];

const toObject = (value) => {
  if (!value) {
    return null;
  }

  return typeof value.toObject === "function" ? value.toObject() : value;
};

const attachRequestedItems = async (request, session = null) => {
  if (!request) {
    return null;
  }

  const requestedItems = await RequestedItem.find({
    recipientRequestID: request._id,
  })
    .populate(
      "inventoryID",
      "itemName category quantity itemPointsCost monthlyLimit itemCondition storageLocation",
    )
    .session(session);

  const data = toObject(request);
  data.requestedItems = requestedItems.map((item) => toObject(item));
  data.requestedItemCount = data.requestedItems.length;

  return data;
};

const fetchRequestWithItems = async (id, session = null) => {
  const request = await RecipientRequest.findById(id)
    .populate(requestPopulation)
    .session(session);
  return attachRequestedItems(request, session);
};

const createPointTransaction = async ({
  recipientUserID,
  requestID,
  amount,
  session,
}) => {
  await PointsTransaction.create(
    [
      {
        recipientUserID,
        changeAmount: amount,
        reason: "recipient_request_reviewed",
        relatedRequestID: requestID,
        date: new Date(),
      },
    ],
    { session },
  );
};

const reviewRequestLogic = async (id, data = {}, options = {}) => {
  const { session: externalSession = null } = options;
  const retryAttempt = Number(options._retryAttempt || 0);
  const maxRetries = Number.isFinite(options.retryAttempts)
    ? Number(options.retryAttempts)
    : 2;
  const status = String(data.status || "")
    .trim()
    .toLowerCase();

  if (!["approved", "rejected", "fulfilled"].includes(status)) {
    throw new BadRequestError(
      "status must be approved, rejected, or fulfilled",
    );
  }

  if (!data.staffReviewerID) {
    throw new BadRequestError(
      "staffReviewerID is required to review recipient requests",
    );
  }

  const session = externalSession || (await mongoose.startSession());
  const ownsSession = !externalSession;

  try {
    if (ownsSession) {
      session.startTransaction();
    }

    const request = await RecipientRequest.findById(id).session(session);
    if (!request) {
      if (ownsSession) {
        await session.abortTransaction();
      }
      return null;
    }

    if (request.status === "rejected" || request.status === "fulfilled") {
      throw new ConflictError("Recipient request already reviewed");
    }

    if (status === "rejected") {
      const updatedRequest = await RecipientRequest.findByIdAndUpdate(
        id,
        {
          status,
          staffReviewerID: data.staffReviewerID,
        },
        { new: true, runValidators: true, session },
      );

      if (ownsSession) {
        await session.commitTransaction();
      }

      return fetchRequestWithItems(updatedRequest._id, null);
    }

    if (request.status === "approved" || request.status === "fulfilled") {
      const updatedRequest = await RecipientRequest.findByIdAndUpdate(
        id,
        {
          status,
          staffReviewerID: data.staffReviewerID,
        },
        { new: true, runValidators: true, session },
      );

      if (ownsSession) {
        await session.commitTransaction();
      }

      return fetchRequestWithItems(updatedRequest._id, null);
    }

    const recipientPoints = await RecipientPoints.findOne({
      recipientUserID: request.recipientUserID,
    }).session(session);
    if (!recipientPoints) {
      throw new NotFoundError(
        "RecipientPoints record not found for this recipient",
      );
    }

    const { totalPointsCost } =
      await requestedItemService.applyApprovedConsumption(id, {
        session,
        staffID: data.staffReviewerID,
      });

    if (recipientPoints.currentPoints < totalPointsCost) {
      throw new BadRequestError("Insufficient recipient points for approval");
    }

    const updatedPoints = await RecipientPoints.findOneAndUpdate(
      {
        recipientUserID: request.recipientUserID,
        currentPoints: { $gte: totalPointsCost },
      },
      {
        $inc: { currentPoints: -totalPointsCost },
        $set: { lastResetDate: new Date() },
      },
      { new: true, session },
    );

    if (!updatedPoints) {
      throw new BadRequestError("Insufficient recipient points for approval");
    }

    await createPointTransaction({
      recipientUserID: request.recipientUserID,
      requestID: request._id,
      amount: -totalPointsCost,
      session,
    });

    const updatedRequest = await RecipientRequest.findByIdAndUpdate(
      id,
      {
        status,
        staffReviewerID: data.staffReviewerID,
      },
      { new: true, runValidators: true, session },
    );

    if (ownsSession) {
      await session.commitTransaction();
    }

    if (status === "approved") {
      await messageService.create({
        userID: request.recipientUserID,
        messageType: "request_approved",
        content:
          "Your aid request was approved and points were deducted according to allocated items.",
      });
    }

    return fetchRequestWithItems(updatedRequest._id, null);
  } catch (error) {
    if (ownsSession) {
      await session.abortTransaction();
    }

    if (
      ownsSession &&
      isRetryableTransactionError(error) &&
      retryAttempt < maxRetries
    ) {
      return reviewRequestLogic(id, data, {
        ...options,
        _retryAttempt: retryAttempt + 1,
      });
    }

    throw error;
  } finally {
    if (ownsSession) {
      session.endSession();
    }
  }
};

const normalizeInventory = (inventory) => {
  const item = toObject(inventory);
  if (!item) {
    return null;
  }

  item.availableQuantity = Number(item.quantity || 0);
  return item;
};

const calculateAvailableItems = async (options = {}) => {
  const inventoryItems = await inventoryService.fetchInventory(
    { minQuantity: 1 },
    { session: options.session || null },
  );
  return inventoryItems.map(normalizeInventory).filter(Boolean);
};

const calculateEligibleItems = async (recipientUserID, options = {}) => {
  const session = options.session || null;
  const [availableItems, pointsRecord, quotas] = await Promise.all([
    calculateAvailableItems({ session }),
    RecipientPoints.findOne({ recipientUserID }).session(session),
    RecipientItemQuota.find({ recipientUserID }).session(session),
  ]);

  const quotaMap = new Map(
    quotas.map((quota) => [String(quota.inventoryID), quota]),
  );
  const currentPoints = Number(pointsRecord?.currentPoints || 0);

  return availableItems
    .map((item) => {
      const quota = quotaMap.get(String(item._id));
      const monthlyLimit = Number(item.monthlyLimit || 0);
      const pastMonthlyTotal = Number(quota?.pastMonthlyTotal || 0);
      const remainingMonthlyQuota = Math.max(
        monthlyLimit - pastMonthlyTotal,
        0,
      );
      const affordableQuantity = Math.min(
        Number(item.availableQuantity || 0),
        remainingMonthlyQuota,
      );
      const canAfford = currentPoints >= Number(item.itemPointsCost || 0);

      if (!canAfford || affordableQuantity <= 0) {
        return null;
      }

      return {
        ...item,
        currentPoints,
        remainingMonthlyQuota,
        affordableQuantity,
      };
    })
    .filter(Boolean);
};

const generateRecommendations = async (recipientUserID, options = {}) => {
  const session = options.session || null;
  const [eligibleItems, priority] = await Promise.all([
    calculateEligibleItems(recipientUserID, { session }),
    RecipientPriority.findOne({ recipientUserID }).session(session),
  ]);

  const priorityFactor = Number(priority?.finalScore || 1);

  return eligibleItems
    .map((item) => {
      const recommendationScore = (
        Number(item.affordableQuantity || 0) * 2 +
        Number(item.remainingMonthlyQuota || 0) +
        priorityFactor -
        Number(item.itemPointsCost || 0)
      ).toFixed(2);

      return {
        ...item,
        recommendationScore: Number(recommendationScore),
        reason: "Affordable within current points and monthly quota",
        priorityScore: priorityFactor,
      };
    })
    .sort(
      (left, right) => right.recommendationScore - left.recommendationScore,
    );
};

const fetchUserRequests = async (recipientUserID, options = {}) => {
  const { session = null } = options;
  const { page, limit, hasPagination } = parsePagination(options, {
    defaultLimit: 20,
    maxLimit: 100,
  });
  let query = RecipientRequest.find({ recipientUserID })
    .select(
      "recipientUserID requestDate status notes staffReviewerID processingStarted processingExpiresAt reviewedAt createdAt updatedAt",
    )
    .sort({ createdAt: -1 })
    .populate(requestPopulation)
    .session(session);

  if (hasPagination) {
    query = query.skip((page - 1) * limit).limit(limit);
  }

  const requests = await query;

  return Promise.all(
    requests.map((request) => attachRequestedItems(request, session)),
  );
};

const fetchRequestById = async (id, options = {}) => {
  return fetchRequestWithItems(id, options.session || null);
};

const fetchAllRequests = async (options = {}) => {
  const { session = null } = options;
  const { page, limit, hasPagination } = parsePagination(options, {
    defaultLimit: 20,
    maxLimit: 100,
  });
  let query = RecipientRequest.find({})
    .select(
      "recipientUserID requestDate status notes staffReviewerID processingStarted processingExpiresAt reviewedAt createdAt updatedAt",
    )
    .sort({ createdAt: -1 })
    .populate(requestPopulation)
    .session(session);

  if (hasPagination) {
    query = query.skip((page - 1) * limit).limit(limit);
  }

  const requests = await query;

  return Promise.all(
    requests.map((request) => attachRequestedItems(request, session)),
  );
};

const createRecipientRequest = async (data, options = {}) => {
  const session = options.session || null;
  const payload = {
    recipientUserID: data.recipientUserID,
    notes: data.notes || "",
    requestDate: data.requestDate || new Date(),
    status: "pending",
  };

  const created = await RecipientRequest.create(
    [payload],
    session ? { session } : {},
  );
  return fetchRequestWithItems(created[0]._id, session);
};

module.exports = {
  ...baseService,
  createRecipientRequest,
  fetchUserRequests,
  fetchRequestById,
  fetchAllRequests,
  reviewRequestLogic,
  calculateAvailableItems,
  calculateEligibleItems,
  generateRecommendations,
  async updateById(id, data, options = {}) {
    if (
      data?.status === "approved" ||
      data?.status === "rejected" ||
      data?.status === "fulfilled"
    ) {
      return reviewRequestLogic(id, data, options);
    }

    return baseService.updateById(id, data, options);
  },
  async create(data, options = {}) {
    return createRecipientRequest(data, options);
  },
};
