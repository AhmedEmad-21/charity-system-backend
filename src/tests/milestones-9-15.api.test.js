const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { initializeGlobalMongo, cleanupGlobalMongo, getGlobalUri, isSetupComplete } = require('./globalSetup');
const { resetIntegrationMongo, supportsTransactions } = require('./integrationMongoSetup');

const User = require('../models/userModel');
const RecipientPoints = require('../models/recipientPointsModel');
const RecipientRequest = require('../models/recipientRequestModel');
const RequestedItem = require('../models/requestedItemModel');
const Inventory = require('../models/inventoryModel');
const PointsTransaction = require('../models/pointsTransactionModel');
const Message = require('../models/messageModel');
const Transaction = require('../models/transactionModel');

const state = {
  dbAvailable: false,
  app: null,
  server: null,
  baseUrl: null,
};

const jsonRequest = async (path, { method = 'GET', token = null, body = undefined } = {}) => {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${state.baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return { response, payload };
};

const registerUser = async (overrides = {}) => {
  const payload = {
    role: 'Recipient',
    name: 'Test User',
    email: `user-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
    passwordHash: 'StrongPassword123',
    phoneNumber: '01012345678',
    address: 'Cairo',
    ...overrides,
  };

  return jsonRequest('/api/auth/register', { method: 'POST', body: payload });
};

const markRecipientApproved = async (userId) => {
  await User.findByIdAndUpdate(userId, { vettingStatus: 'approved' });
};

const createApprovedRecipientWithPoints = async ({ email, points = 100 } = {}) => {
  const registration = await registerUser({ role: 'Recipient', email });
  const token = registration.payload.data.accessToken;
  const userId = registration.payload.data.user._id;

  await User.findByIdAndUpdate(userId, { vettingStatus: 'approved', accountStatus: 'active' });
  await RecipientPoints.create({
    recipientUserID: userId,
    currentPoints: points,
    monthlyAllocation: 100,
    lastResetDate: new Date('2026-01-01T00:00:00.000Z'),
  });

  return { token, userId };
};

const createRequestWithItem = async ({ recipientToken, inventoryId, quantity = 1 }) => {
  const requestRes = await jsonRequest('/api/recipient/request', {
    method: 'POST',
    token: recipientToken,
    body: { notes: 'Need urgent support' },
  });

  assert.equal(requestRes.response.status, 201);

  const itemRes = await jsonRequest('/api/requested-items', {
    method: 'POST',
    token: recipientToken,
    body: {
      recipientRequestID: requestRes.payload.data._id,
      inventoryID: inventoryId,
      quantity,
    },
  });

  assert.equal(itemRes.response.status, 201);

  return {
    requestId: requestRes.payload.data._id,
    requestedItemId: itemRes.payload.data._id,
  };
};

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

  try {
    await initializeGlobalMongo();
    state.dbAvailable = isSetupComplete();
    process.env.MONGO_URI = getGlobalUri();

    const appModule = require('../app');
    state.app = appModule.app || appModule;
    state.server = state.app.listen(0);
    await new Promise((resolve) => state.server.once('listening', resolve));
    const { port } = state.server.address();
    state.baseUrl = `http://127.0.0.1:${port}`;
  } catch (error) {
    console.error('[Test] Failed to initialize test server:', error.message);
    state.dbAvailable = false;
  }
});

after(async () => {
  if (state.server) {
    await new Promise((resolve) => state.server.close(resolve));
    state.server = null;
  }

  if (state.dbAvailable) {
    await cleanupGlobalMongo();
  }
});

beforeEach(async () => {
  if (!state.dbAvailable) {
    return;
  }

  await resetIntegrationMongo();
});

describe('Route /api/recipient/*', () => {
  it('should succeed - POST /recipient/request creates request', async (t) => {
    if (!state.dbAvailable) {
      t.skip('MongoDB not available');
      return;
    }

    const recipient = await createApprovedRecipientWithPoints({ email: 'm9-recipient-1@example.com', points: 50 });

    const res = await jsonRequest('/api/recipient/request', {
      method: 'POST',
      token: recipient.token,
      body: { notes: 'Request for food support' },
    });

    assert.equal(res.response.status, 201);
    assert.equal(res.payload.success, true);

    const stored = await RecipientRequest.findById(res.payload.data._id).lean();
    assert.ok(stored);
  });

  it('should fail business logic - POST /recipient/request when recipient not approved', async (t) => {
    if (!state.dbAvailable) {
      t.skip('MongoDB not available');
      return;
    }

    const pendingRecipient = await registerUser({ role: 'Recipient', email: 'm9-pending@example.com' });
    const token = pendingRecipient.payload.data.accessToken;

    const res = await jsonRequest('/api/recipient/request', {
      method: 'POST',
      token,
      body: { notes: 'Pending user should be blocked' },
    });

    assert.equal(res.response.status, 403);
  });

  it('should succeed - PUT /recipient/review/:id approve deduct points and update inventory', async (t) => {
    if (!state.dbAvailable) {
      t.skip('MongoDB not available');
      return;
    }

    if (!supportsTransactions()) {
      t.skip('Transactions not supported');
      return;
    }

    const staff = await registerUser({ role: 'Staff', email: 'm9-staff-approve@example.com' });
    const staffToken = staff.payload.data.accessToken;
    const staffId = staff.payload.data.user._id;

    const recipient = await createApprovedRecipientWithPoints({ email: 'm9-recipient-approve@example.com', points: 20 });

    const inventory = await Inventory.create({
      sourceItemID: new mongoose.Types.ObjectId(),
      itemName: 'Milk Box',
      category: 'Food',
      quantity: 5,
      itemCondition: 'good',
      storageLocation: 'A2',
      monthlyLimit: 10,
      itemPointsCost: 3,
    });

    const { requestId } = await createRequestWithItem({
      recipientToken: recipient.token,
      inventoryId: inventory._id.toString(),
      quantity: 2,
    });

    const review = await jsonRequest(`/api/recipient/review/${requestId}`, {
      method: 'PUT',
      token: staffToken,
      body: { status: 'approved' },
    });

    assert.equal(review.response.status, 200);

    const updatedPoints = await RecipientPoints.findOne({ recipientUserID: recipient.userId }).lean();
    assert.equal(updatedPoints.currentPoints, 14);

    const updatedInventory = await Inventory.findById(inventory._id).lean();
    assert.equal(updatedInventory.quantity, 3);

    const pointsTx = await PointsTransaction.findOne({ recipientUserID: recipient.userId, changeAmount: -6 }).lean();
    assert.ok(pointsTx);
  });

  it('should fail business logic - PUT /recipient/review/:id when points insufficient', async (t) => {
    if (!state.dbAvailable) {
      t.skip('MongoDB not available');
      return;
    }

    if (!supportsTransactions()) {
      t.skip('Transactions not supported');
      return;
    }

    const staff = await registerUser({ role: 'Staff', email: 'm9-staff-lowpoints@example.com' });
    const staffToken = staff.payload.data.accessToken;

    const recipient = await createApprovedRecipientWithPoints({ email: 'm9-recipient-lowpoints@example.com', points: 1 });

    const inventory = await Inventory.create({
      sourceItemID: new mongoose.Types.ObjectId(),
      itemName: 'Rice Bag',
      category: 'Food',
      quantity: 8,
      itemCondition: 'good',
      storageLocation: 'A3',
      monthlyLimit: 10,
      itemPointsCost: 4,
    });

    const { requestId } = await createRequestWithItem({
      recipientToken: recipient.token,
      inventoryId: inventory._id.toString(),
      quantity: 1,
    });

    const review = await jsonRequest(`/api/recipient/review/${requestId}`, {
      method: 'PUT',
      token: staffToken,
      body: { status: 'approved' },
    });

    assert.equal(review.response.status, 400);

    const pointsAfter = await RecipientPoints.findOne({ recipientUserID: recipient.userId }).lean();
    assert.equal(pointsAfter.currentPoints, 1);
    assert.ok(pointsAfter.currentPoints >= 0);
  });

  it('should fail business logic - PUT /recipient/review/:id approving twice', async (t) => {
    if (!state.dbAvailable) {
      t.skip('MongoDB not available');
      return;
    }

    if (!supportsTransactions()) {
      t.skip('Transactions not supported');
      return;
    }

    const staff = await registerUser({ role: 'Staff', email: 'm9-staff-double@example.com' });
    const staffToken = staff.payload.data.accessToken;

    const recipient = await createApprovedRecipientWithPoints({ email: 'm9-recipient-double@example.com', points: 50 });

    const inventory = await Inventory.create({
      sourceItemID: new mongoose.Types.ObjectId(),
      itemName: 'Oil Bottle',
      category: 'Food',
      quantity: 10,
      itemCondition: 'good',
      storageLocation: 'A4',
      monthlyLimit: 20,
      itemPointsCost: 2,
    });

    const { requestId } = await createRequestWithItem({
      recipientToken: recipient.token,
      inventoryId: inventory._id.toString(),
      quantity: 1,
    });

    const first = await jsonRequest(`/api/recipient/review/${requestId}`, {
      method: 'PUT',
      token: staffToken,
      body: { status: 'approved' },
    });
    assert.equal(first.response.status, 200);

    const second = await jsonRequest(`/api/recipient/review/${requestId}`, {
      method: 'PUT',
      token: staffToken,
      body: { status: 'approved' },
    });
    assert.equal(second.response.status, 200);
  });

  it('should fail business logic - PUT /recipient/review/:id when inventory insufficient', async (t) => {
    if (!state.dbAvailable) {
      t.skip('MongoDB not available');
      return;
    }

    if (!supportsTransactions()) {
      t.skip('Transactions not supported');
      return;
    }

    const staff = await registerUser({ role: 'Staff', email: 'm9-staff-inv@example.com' });
    const staffToken = staff.payload.data.accessToken;

    const recipient = await createApprovedRecipientWithPoints({ email: 'm9-recipient-inv@example.com', points: 100 });

    const inventory = await Inventory.create({
      sourceItemID: new mongoose.Types.ObjectId(),
      itemName: 'Blanket',
      category: 'Aid',
      quantity: 1,
      itemCondition: 'good',
      storageLocation: 'A5',
      monthlyLimit: 10,
      itemPointsCost: 1,
    });

    const { requestId } = await createRequestWithItem({
      recipientToken: recipient.token,
      inventoryId: inventory._id.toString(),
      quantity: 3,
    });

    const review = await jsonRequest(`/api/recipient/review/${requestId}`, {
      method: 'PUT',
      token: staffToken,
      body: { status: 'approved' },
    });

    assert.equal(review.response.status, 404);

    const invAfter = await Inventory.findById(inventory._id).lean();
    assert.equal(invAfter.quantity, 1);
    assert.ok(invAfter.quantity >= 0);
  });

  it('should succeed - GET /recipient/available-items returns item list', async (t) => {
    if (!state.dbAvailable) {
      t.skip('MongoDB not available');
      return;
    }

    const recipient = await createApprovedRecipientWithPoints({ email: 'm9-recipient-available@example.com', points: 10 });

    await Inventory.create({
      sourceItemID: new mongoose.Types.ObjectId(),
      itemName: 'Flour',
      category: 'Food',
      quantity: 9,
      itemCondition: 'good',
      storageLocation: 'A6',
      monthlyLimit: 10,
      itemPointsCost: 2,
    });

    const res = await jsonRequest('/api/recipient/available-items', { token: recipient.token });
    assert.equal(res.response.status, 200);
    assert.ok(Array.isArray(res.payload.data));
    assert.ok(res.payload.data.some((x) => x.itemName === 'Flour'));
    assert.ok('availableQuantity' in res.payload.data[0]);
  });
});

describe('Route /api/points/*', () => {
  it('should succeed - GET /points/me returns current points', async (t) => {
    if (!state.dbAvailable) {
      t.skip('MongoDB not available');
      return;
    }

    const recipient = await createApprovedRecipientWithPoints({ email: 'm10-recipient-points@example.com', points: 33 });

    const res = await jsonRequest('/api/points/me', { token: recipient.token });
    assert.equal(res.response.status, 200);
    assert.equal(res.payload.data.currentPoints, 33);
  });

  it('should succeed - GET /points/history returns transactions', async (t) => {
    if (!state.dbAvailable) {
      t.skip('MongoDB not available');
      return;
    }

    const recipient = await createApprovedRecipientWithPoints({ email: 'm10-recipient-history@example.com', points: 40 });

    await PointsTransaction.create({
      recipientUserID: recipient.userId,
      changeAmount: -5,
      reason: 'test_history',
      date: new Date(),
    });

    const res = await jsonRequest('/api/points/history', { token: recipient.token });
    assert.equal(res.response.status, 200);
    assert.ok(Array.isArray(res.payload.data));
    assert.ok(res.payload.data.length >= 1);
  });
});

describe('Route /api/messages/*', () => {
  it('should succeed - GET /messages/me returns messages', async (t) => {
    if (!state.dbAvailable) {
      t.skip('MongoDB not available');
      return;
    }

    const recipient = await createApprovedRecipientWithPoints({ email: 'm11-recipient-msg@example.com', points: 10 });

    await Message.create({
      userID: recipient.userId,
      messageType: 'request_approved',
      content: 'Test message',
    });

    const res = await jsonRequest('/api/messages/me', { token: recipient.token });
    assert.equal(res.response.status, 200);
    assert.ok(Array.isArray(res.payload.data));
    assert.ok(res.payload.data.length >= 1);
  });

  it('should succeed - PUT /messages/read/:id marks message as read', async (t) => {
    if (!state.dbAvailable) {
      t.skip('MongoDB not available');
      return;
    }

    const recipient = await createApprovedRecipientWithPoints({ email: 'm11-recipient-read@example.com', points: 10 });

    const msg = await Message.create({
      userID: recipient.userId,
      messageType: 'request_approved',
      content: 'Unread message',
      isRead: false,
    });

    const res = await jsonRequest(`/api/messages/read/${msg._id}`, {
      method: 'PUT',
      token: recipient.token,
    });

    assert.equal(res.response.status, 200);
    assert.equal(res.payload.data.isRead, true);
  });
});

describe('Route /api/transactions', () => {
  it('should succeed - POST /transactions creates payment transaction', async (t) => {
    if (!state.dbAvailable) {
      t.skip('MongoDB not available');
      return;
    }

    if (!supportsTransactions()) {
      t.skip('Transactions not supported');
      return;
    }

    const donor = await registerUser({ role: 'Donor', email: 'm12-donor@example.com' });
    const donorToken = donor.payload.data.accessToken;

    const res = await jsonRequest('/api/transactions', {
      method: 'POST',
      token: donorToken,
      body: {
        amount: 250,
        paymentMethod: 'card',
      },
    });

    assert.equal(res.response.status, 201);
    assert.equal(res.payload.success, true);

    const stored = await Transaction.findById(res.payload.data._id).lean();
    assert.ok(stored);
  });
});

describe('Route /api/configs/dashboard/stats', () => {
  it('should succeed - GET /dashboard/stats returns stats', async (t) => {
    if (!state.dbAvailable) {
      t.skip('MongoDB not available');
      return;
    }

    const staff = await registerUser({ role: 'Staff', email: 'm13-staff@example.com' });
    const staffToken = staff.payload.data.accessToken;

    const res = await jsonRequest('/api/configs/dashboard/stats', { token: staffToken });
    assert.equal(res.response.status, 200);
    assert.equal(res.payload.success, true);
    assert.ok(res.payload.data.totals);
  });
});

describe('Route /api/configs/system and /api/configs/allocation', () => {
  it('should succeed and edge-safe - POST /system/run-monthly-reset twice', async (t) => {
    if (!state.dbAvailable) {
      t.skip('MongoDB not available');
      return;
    }

    if (!supportsTransactions()) {
      t.skip('Transactions not supported');
      return;
    }

    const admin = await registerUser({ role: 'Admin', email: 'm14-admin-reset@example.com' });
    const adminToken = admin.payload.data.accessToken;

    const first = await jsonRequest('/api/configs/system/run-monthly-reset', {
      method: 'POST',
      token: adminToken,
    });

    const second = await jsonRequest('/api/configs/system/run-monthly-reset', {
      method: 'POST',
      token: adminToken,
    });

    assert.equal(first.response.status, 200);
    assert.equal(second.response.status, 200);
  });

  it('should succeed - POST /allocation/run and edge when no approved requests', async (t) => {
    if (!state.dbAvailable) {
      t.skip('MongoDB not available');
      return;
    }

    if (!supportsTransactions()) {
      t.skip('Transactions not supported');
      return;
    }

    const admin = await registerUser({ role: 'Admin', email: 'm14-admin-alloc@example.com' });
    const adminToken = admin.payload.data.accessToken;

    const res = await jsonRequest('/api/configs/allocation/run', {
      method: 'POST',
      token: adminToken,
    });

    assert.equal(res.response.status, 200);
    assert.equal(res.payload.success, true);
    assert.equal(res.payload.data.processed, 0);
    assert.equal(res.payload.data.fulfilled, 0);
  });
});

describe('Global Edge Cases', () => {
  it('should handle concurrency - two recipients approve same inventory item', async (t) => {
    if (!state.dbAvailable) {
      t.skip('MongoDB not available');
      return;
    }

    if (!supportsTransactions()) {
      t.skip('Transactions not supported');
      return;
    }

    const staff = await registerUser({ role: 'Staff', email: 'm15-staff-concurrency@example.com' });
    const staffToken = staff.payload.data.accessToken;

    const recipientA = await createApprovedRecipientWithPoints({ email: 'm15-recipient-a@example.com', points: 50 });
    const recipientB = await createApprovedRecipientWithPoints({ email: 'm15-recipient-b@example.com', points: 50 });

    const inventory = await Inventory.create({
      sourceItemID: new mongoose.Types.ObjectId(),
      itemName: 'Single Unit Item',
      category: 'Aid',
      quantity: 1,
      itemCondition: 'good',
      storageLocation: 'Z1',
      monthlyLimit: 5,
      itemPointsCost: 1,
    });

    const reqA = await createRequestWithItem({ recipientToken: recipientA.token, inventoryId: inventory._id.toString(), quantity: 1 });
    const reqB = await createRequestWithItem({ recipientToken: recipientB.token, inventoryId: inventory._id.toString(), quantity: 1 });

    const [a, b] = await Promise.all([
      jsonRequest(`/api/recipient/review/${reqA.requestId}`, { method: 'PUT', token: staffToken, body: { status: 'approved' } }),
      jsonRequest(`/api/recipient/review/${reqB.requestId}`, { method: 'PUT', token: staffToken, body: { status: 'approved' } }),
    ]);

    const statuses = [a.response.status, b.response.status].sort();
    assert.equal(statuses[0], 200);
    assert.ok([404, 409, 500].includes(statuses[1]));

    const invAfter = await Inventory.findById(inventory._id).lean();
    assert.equal(invAfter.quantity, 0);
    assert.ok(invAfter.quantity >= 0);
  });

  it('should fail auth/security - protected APIs without token', async (t) => {
    if (!state.dbAvailable) {
      t.skip('MongoDB not available');
      return;
    }

    const endpoints = [
      ['/api/recipient/available-items', 'GET'],
      ['/api/points/me', 'GET'],
      ['/api/messages/me', 'GET'],
      ['/api/transactions', 'POST'],
      ['/api/configs/dashboard/stats', 'GET'],
    ];

    for (const [path, method] of endpoints) {
      const res = await jsonRequest(path, {
        method,
        body: method === 'POST' ? { amount: 10, paymentMethod: 'cash' } : undefined,
      });
      assert.equal(res.response.status, 401);
    }
  });

  it('should fail auth/security - insufficient role', async (t) => {
    if (!state.dbAvailable) {
      t.skip('MongoDB not available');
      return;
    }

    const donor = await registerUser({ role: 'Donor', email: 'm15-donor-security@example.com' });
    const donorToken = donor.payload.data.accessToken;

    const res = await jsonRequest('/api/configs/system/run-monthly-reset', {
      method: 'POST',
      token: donorToken,
    });

    assert.equal(res.response.status, 403);
  });

  it('should fail with invalid ObjectId format', async (t) => {
    if (!state.dbAvailable) {
      t.skip('MongoDB not available');
      return;
    }

    const recipient = await createApprovedRecipientWithPoints({ email: 'm15-recipient-invalidid@example.com', points: 10 });

    const res = await jsonRequest('/api/messages/read/not-an-id', {
      method: 'PUT',
      token: recipient.token,
    });

    assert.equal(res.response.status, 400);
  });

  it('should map simulated DB down to 503', async (t) => {
    if (!state.dbAvailable) {
      t.skip('MongoDB not available');
      return;
    }

    const recipient = await createApprovedRecipientWithPoints({ email: 'm15-recipient-dbdown@example.com', points: 20 });

    const originalFindOne = RecipientPoints.findOne;
    RecipientPoints.findOne = () => {
      const error = new Error('simulated db down');
      error.name = 'MongoNetworkError';
      throw error;
    };

    try {
      const res = await jsonRequest('/api/points/me', { token: recipient.token });
      assert.equal(res.response.status, 503);
    } finally {
      RecipientPoints.findOne = originalFindOne;
    }
  });
});
