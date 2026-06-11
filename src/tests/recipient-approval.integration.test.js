const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const recipientRequestService = require('../services/recipientRequestService');
const requestedItemService = require('../services/requestedItemService');
const { initializeGlobalMongo, cleanupGlobalMongo, isSetupComplete } = require('./globalSetup');
const { resetIntegrationMongo, supportsTransactions } = require('./integrationMongoSetup');

const User = require('../models/userModel');
const RecipientPoints = require('../models/recipientPointsModel');
const Inventory = require('../models/inventoryModel');
const RecipientRequest = require('../models/recipientRequestModel');
const RecipientItemQuota = require('../models/recipientItemQuotaModel');
const PointsTransaction = require('../models/pointsTransactionModel');

const state = {
  dbAvailable: false,
};

test.before(async () => {
  try {
    await initializeGlobalMongo();
    state.dbAvailable = isSetupComplete();
  } catch (error) {
    console.error('[Test] Failed to initialize MongoDB:', error.message);
    state.dbAvailable = false;
  }
});

test.after(async () => {
  if (!state.dbAvailable) {
    return;
  }

  await cleanupGlobalMongo();
});

test.beforeEach(async () => {
  if (!state.dbAvailable) {
    return;
  }

  await resetIntegrationMongo();
});

const createBaseRecipientFlow = async ({ currentPoints, requestedQuantity, itemPointsCost = 2, monthlyLimit = 10 }) => {
  const recipient = await User.create({
    role: 'Recipient',
    name: 'Integration Recipient',
    email: `recipient-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
    passwordHash: 'StrongPassword123',
    phoneNumber: '01012345678',
    address: 'Cairo',
    vettingStatus: 'approved',
    accountStatus: 'active',
  });

  await RecipientPoints.create({
    recipientUserID: recipient._id,
    currentPoints,
    monthlyAllocation: 100,
    lastResetDate: new Date(),
  });

  const inventory = await Inventory.create({
    sourceItemID: new mongoose.Types.ObjectId(),
    itemName: 'Blanket',
    quantity: 100,
    itemCondition: 'good',
    storageLocation: 'A1',
    monthlyLimit,
    itemPointsCost,
    lastMovementDate: new Date(),
  });

  const recipientRequest = await RecipientRequest.create({
    recipientUserID: recipient._id,
    status: 'pending',
  });

  await requestedItemService.create({
    recipientRequestID: recipientRequest._id,
    inventoryID: inventory._id,
    quantity: requestedQuantity,
  });

  return { recipient, inventory, recipientRequest };
};

test('approval transaction succeeds and synchronizes points, inventory, and quota', async (t) => {
  if (!state.dbAvailable) {
    t.skip('MongoDB server is not available for integration testing');
    return;
  }

  if (!supportsTransactions()) {
    t.skip('MongoDB transactions require replica set support');
    return;
  }

  const { recipient, inventory, recipientRequest } = await createBaseRecipientFlow({
    currentPoints: 100,
    requestedQuantity: 3,
    itemPointsCost: 2,
  });

  const updatedRequest = await recipientRequestService.updateById(recipientRequest._id, {
    status: 'approved',
    staffReviewerID: new mongoose.Types.ObjectId(),
  });

  assert.equal(updatedRequest.status, 'approved');

  const pointsAfter = await RecipientPoints.findOne({ recipientUserID: recipient._id }).lean();
  assert.equal(pointsAfter.currentPoints, 94);

  const inventoryAfter = await Inventory.findById(inventory._id).lean();
  assert.equal(inventoryAfter.quantity, 97);

  const quotaAfter = await RecipientItemQuota.findOne({
    recipientUserID: recipient._id,
    inventoryID: inventory._id,
  }).lean();
  assert.equal(quotaAfter.pastMonthlyTotal, 3);

  const pointsTx = await PointsTransaction.findOne({ relatedRequestID: recipientRequest._id }).lean();
  assert.ok(pointsTx);
  assert.equal(pointsTx.changeAmount, -6);
});

test('approval transaction rolls back when points are insufficient', async (t) => {
  if (!state.dbAvailable) {
    t.skip('MongoDB server is not available for integration testing');
    return;
  }

  if (!supportsTransactions()) {
    t.skip('MongoDB transactions require replica set support');
    return;
  }

  const { recipient, inventory, recipientRequest } = await createBaseRecipientFlow({
    currentPoints: 2,
    requestedQuantity: 2,
    itemPointsCost: 2,
  });

  await assert.rejects(
    recipientRequestService.updateById(recipientRequest._id, {
      status: 'approved',
      staffReviewerID: new mongoose.Types.ObjectId(),
    }),
    /Insufficient recipient points/
  );

  const requestAfter = await RecipientRequest.findById(recipientRequest._id).lean();
  assert.equal(requestAfter.status, 'pending');

  const pointsAfter = await RecipientPoints.findOne({ recipientUserID: recipient._id }).lean();
  assert.equal(pointsAfter.currentPoints, 2);

  const inventoryAfter = await Inventory.findById(inventory._id).lean();
  assert.equal(inventoryAfter.quantity, 100);

  const quotaAfter = await RecipientItemQuota.findOne({
    recipientUserID: recipient._id,
    inventoryID: inventory._id,
  }).lean();
  assert.equal(quotaAfter.pastMonthlyTotal, 0);

  const pointsTx = await PointsTransaction.findOne({ relatedRequestID: recipientRequest._id }).lean();
  assert.equal(pointsTx, null);
});
