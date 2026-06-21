const recipientRequestService = require('../services/recipientRequestService');
const requestedItemService = require('../services/requestedItemService');
const mongoose = require("mongoose");

const getActorUserID = (req) => req.user?.id || req.user?._id || req.user?.userId || null;
const respond = (res, data, statusCode = 200) => res.status(statusCode).json({ success: true, data });

const controller = {
  async createRequest(req, res, next) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const actorID = getActorUserID(req);
      const newRequest = await recipientRequestService.createRecipientRequest({ ...req.body, recipientUserID: actorID }, { session });
      if (req.body.items && Array.isArray(req.body.items)) {
        for (const item of req.body.items) {
          await requestedItemService.createRequestedItemLogic({ ...item, recipientRequestID: newRequest._id }, { session, actorUserID: actorID });
        }
      }
      await session.commitTransaction();
      const populatedRequest = await recipientRequestService.fetchRequestById(newRequest._id);
      return respond(res, populatedRequest, 201);
    } catch (error) {
      await session.abortTransaction();
      return next(error);
    } finally {
      session.endSession();
    }
  },

  async getMyRequests(req, res, next) {
    try {
      const data = await recipientRequestService.fetchUserRequests(getActorUserID(req));
      return respond(res, data);
    } catch (error) { return next(error); }
  },

  async getRequestById(req, res, next) {
    try {
      const data = await recipientRequestService.fetchRequestById(req.params.id);
      return data ? respond(res, data) : res.status(404).json({ success: false, message: 'Not found' });
    } catch (error) { return next(error); }
  },

  async getAllRequests(req, res, next) {
    try {
      const data = await recipientRequestService.fetchAllRequests();
      return respond(res, data);
    } catch (error) { return next(error); }
  },

  async reviewRequest(req, res, next) {
    try {
      const data = await recipientRequestService.reviewRequestLogic(req.params.id, {
        status: req.body.status,
        staffReviewerID: getActorUserID(req),
        staffID: getActorUserID(req),
      });
      return respond(res, data);
    } catch (error) { return next(error); }
  },

  async getAvailableItems(req, res, next) {
    try {
      const data = await recipientRequestService.calculateAvailableItems({});
      return respond(res, data);
    } catch (error) { return next(error); }
  },

  async getEligibleItems(req, res, next) {
    try {
      const data = await recipientRequestService.calculateEligibleItems(getActorUserID(req));
      return respond(res, data);
    } catch (error) { return next(error); }
  },

  async getRecommendations(req, res, next) {
    try {
      const data = await recipientRequestService.generateRecommendations(getActorUserID(req));
      return respond(res, data);
    } catch (error) { return next(error); }
  },

  async approve(req, res, next) {
    req.body.status = 'approved';
    return controller.reviewRequest(req, res, next);
  },

  async fulfill(req, res, next) {
    req.body.status = 'fulfilled';
    return controller.reviewRequest(req, res, next);
  }
};

module.exports = controller;
