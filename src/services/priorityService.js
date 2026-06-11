const VettingRequest = require('../models/vettingRequestModel');
const RecipientPriority = require('../models/recipientPriorityModel');
const User = require('../models/userModel');
const config = require('../config/appConfig');
const { calculatePriority } = require('./priorityEngineService');
const { NotFoundError } = require('../errors/appErrors');

const fetchUserPriority = async (userId) => {
  return RecipientPriority.findOne({ recipientUserID: userId }).populate('recipientUserID', 'name email role vettingStatus');
};

const fetchRankedUsers = async () => {
  return RecipientPriority.find({})
    .sort({ finalScore: -1, lastCalculated: -1 })
    .populate('recipientUserID', 'name email role vettingStatus createdAt');
};

const fetchTopPriority = async (limit = 10) => {
  const safeLimit = Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 10;
  return RecipientPriority.find({})
    .sort({ finalScore: -1, lastCalculated: -1 })
    .limit(safeLimit)
    .populate('recipientUserID', 'name email role vettingStatus createdAt');
};

const recalculatePriority = async (userId, options = {}) => {
  if (!config.features.enablePriority) {
    return null;
  }

  const vetting = await VettingRequest.findOne({ recipientUserID: userId, vettingStatus: 'approved' }).lean();
  if (!vetting) {
    throw new NotFoundError('Approved vetting record not found for user');
  }

  return calculatePriority(
    {
      recipientUserID: vetting.recipientUserID,
      monthlyIncome: vetting.monthlyIncome,
      familyMembers: vetting.familyMembers,
      healthStatus: vetting.healthStatus,
    },
    { session: options.session }
  );
};

const recalculateAllPriorities = async (options = {}) => {
  if (!config.features.enablePriority) {
    return [];
  }

  const approvedVettingRecords = await VettingRequest.find({ vettingStatus: 'approved' }).lean();

  const operations = approvedVettingRecords.map((record) =>
    calculatePriority({
      recipientUserID: record.recipientUserID,
      monthlyIncome: record.monthlyIncome,
      familyMembers: record.familyMembers,
      healthStatus: record.healthStatus,
    }, { session: options.session })
  );

  await Promise.all(operations);
};

module.exports = {
  fetchUserPriority,
  fetchRankedUsers,
  fetchTopPriority,
  recalculatePriority,
  recalculateAllPriorities,
  // Backward compatibility for existing callers
  recalculateAllRecipientPriorities: recalculateAllPriorities,
};
