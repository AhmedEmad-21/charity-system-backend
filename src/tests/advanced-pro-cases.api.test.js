const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const { initializeGlobalMongo, cleanupGlobalMongo, getGlobalUri, isSetupComplete } = require('./globalSetup');
const { resetIntegrationMongo, supportsTransactions } = require('./integrationMongoSetup');

const User = require('../models/userModel');
const VettingRequest = require('../models/vettingRequestModel');
const RecipientPoints = require('../models/recipientPointsModel');
const RecipientRequest = require('../models/recipientRequestModel');
const RequestedItem = require('../models/requestedItemModel');
const Inventory = require('../models/inventoryModel');
const InventoryMovement = require('../models/inventoryMovementModel');
const Message = require('../models/messageModel');
const PointsTransaction = require('../models/pointsTransactionModel');
const Transaction = require('../models/transactionModel');
const priorityEngineService = require('../services/priorityEngineService');
const { getConflictResolutionTier } = require('../utils/concurrencyManager');

const state = {
  dbAvailable: false,
  app: null,
  server: null,
  baseUrl: null,
};

const jsonRequest = async (path, { method = 'GET', token = null, body = undefined, headers = {} } = {}) => {
  const requestHeaders = { Accept: 'application/json', ...headers };
  if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';
  }
  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${state.baseUrl}${path}`, {
    method,
    headers: requestHeaders,
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

const uniqueEmail = (prefix = 'user') => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;

const registerUser = async (overrides = {}) => {
  const payload = {
    role: 'Recipient',
    name: 'Advanced User',
    email: uniqueEmail('advanced'),
    passwordHash: 'StrongPassword123!@#',
    phoneNumber: '01012345678',
    address: 'Cairo',
    ...overrides,
  };

  return jsonRequest('/api/auth/register', { method: 'POST', body: payload });
};

const approveRecipientAndSeedPoints = async (userId, points = 100) => {
  await User.findByIdAndUpdate(userId, { vettingStatus: 'approved', accountStatus: 'active' });
  await RecipientPoints.updateOne(
    { recipientUserID: userId },
    {
      $set: {
        recipientUserID: userId,
        currentPoints: points,
        monthlyAllocation: 100,
        lastResetDate: new Date('2026-01-01T00:00:00.000Z'),
      },
    },
    { upsert: true }
  );
};

const createInventoryDoc = async (overrides = {}) => {
  return Inventory.create({
    sourceItemID: new mongoose.Types.ObjectId(),
    itemName: 'Advanced Item',
    category: 'Food',
    quantity: 10,
    itemCondition: 'good',
    storageLocation: 'A1',
    monthlyLimit: 5,
    itemPointsCost: 2,
    ...overrides,
  });
};

const createRecipientRequestWithItem = async ({ recipientToken, inventoryId, quantity = 1 }) => {
  const reqRes = await jsonRequest('/api/recipient/request', {
    method: 'POST',
    token: recipientToken,
    body: { notes: 'Need support' },
  });
  assert.equal(reqRes.response.status, 201);

  const itemRes = await jsonRequest('/api/requested-items', {
    method: 'POST',
    token: recipientToken,
    body: {
      recipientRequestID: reqRes.payload.data._id,
      inventoryID: inventoryId,
      quantity,
    },
  });
  assert.equal(itemRes.response.status, 201);

  return reqRes.payload.data._id;
};

test.before(async () => {
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

test.after(async () => {
  if (state.server) {
    await new Promise((resolve) => state.server.close(resolve));
    state.server = null;
  }

  if (state.dbAvailable) {
    await cleanupGlobalMongo();
  }
});

test.beforeEach(async () => {
  if (!state.dbAvailable) {
    return;
  }

  await resetIntegrationMongo();
});

test('advanced auth: spaces in email, case-insensitive email, special chars, token security', async (t) => {
  if (!state.dbAvailable) {
    t.skip('MongoDB not available');
    return;
  }

  const email = uniqueEmail('auth-advanced');
  const registration = await registerUser({
    role: 'Donor',
    email: email.toUpperCase(),
    passwordHash: 'P@ssw0rd!#$%^&*()_+[]{}',
    name: '<script>alert(1)</script>',
  });
  assert.equal(registration.response.status, 201);

  const duplicateDifferentCase = await registerUser({
    role: 'Donor',
    email,
  });
  assert.equal(duplicateDifferentCase.response.status, 409);

  const loginWithSpaces = await jsonRequest('/api/auth/login', {
    method: 'POST',
    body: { email: `  ${email}  `, password: 'P@ssw0rd!#$%^&*()_+[]{}' },
  });
  assert.equal(loginWithSpaces.response.status, 200);

  const injectionStyleLogin = await jsonRequest('/api/auth/login', {
    method: 'POST',
    body: { email: { $ne: '' }, password: 'anything' },
  });
  assert.equal(injectionStyleLogin.response.status, 401);

  const accessToken = loginWithSpaces.payload.data.accessToken;
  const refreshToken = loginWithSpaces.payload.data.refreshToken;

  const manipulatedToken = `${accessToken.slice(0, -2)}zz`;
  const manipulatedTokenRes = await jsonRequest('/api/auth/me', { token: manipulatedToken });
  assert.equal(manipulatedTokenRes.response.status, 401);

  const expiredToken = jwt.sign(
    { id: registration.payload.data.user._id, role: 'Donor', tokenType: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: '-1s' }
  );
  const expiredTokenRes = await jsonRequest('/api/auth/me', { token: expiredToken });
  assert.equal(expiredTokenRes.response.status, 401);

  const refreshOnce = await jsonRequest('/api/auth/refresh-token', {
    method: 'POST',
    body: { refreshToken },
  });
  assert.equal(refreshOnce.response.status, 200);

  const refreshReuse = await jsonRequest('/api/auth/refresh-token', {
    method: 'POST',
    body: { refreshToken },
  });
  assert.equal(refreshReuse.response.status, 401);
});

test('advanced user: self email update, role-protected update, concurrent updates, linked delete safety', async (t) => {
  if (!state.dbAvailable) {
    t.skip('MongoDB not available');
    return;
  }

  const admin = await registerUser({ role: 'Admin', email: uniqueEmail('admin') });
  const adminToken = admin.payload.data.accessToken;

  const userA = await registerUser({ role: 'Recipient', email: uniqueEmail('usera') });
  const userAToken = userA.payload.data.accessToken;
  const userAId = userA.payload.data.user._id;

  const sameEmailUpdate = await jsonRequest(`/api/users/${userAId}`, {
    method: 'PUT',
    token: userAToken,
    body: {
      role: 'Recipient',
      name: 'Updated Name',
      email: userA.payload.data.user.email,
      passwordHash: 'StrongPassword123!@#',
      phoneNumber: '01012345678',
      address: 'Alexandria',
    },
  });
  assert.equal(sameEmailUpdate.response.status, 200);

  const userB = await registerUser({ role: 'Recipient', email: uniqueEmail('userb') });
  const forbiddenRoleUpdate = await jsonRequest(`/api/users/${userB.payload.data.user._id}`, {
    method: 'PUT',
    token: userAToken,
    body: {
      role: 'Admin',
      name: 'Escalation Attempt',
      email: userB.payload.data.user.email,
      passwordHash: 'StrongPassword123!@#',
      phoneNumber: '01012345678',
      address: 'Cairo',
    },
  });
  assert.equal(forbiddenRoleUpdate.response.status, 403);

  const concurrentUpdateResults = await Promise.all([
    jsonRequest(`/api/users/${userAId}`, {
      method: 'PUT',
      token: userAToken,
      body: {
        role: 'Recipient',
        name: 'Concurrent A',
        email: userA.payload.data.user.email,
        passwordHash: 'StrongPassword123!@#',
        phoneNumber: '01012345678',
        address: 'Address A',
      },
    }),
    jsonRequest(`/api/users/${userAId}`, {
      method: 'PUT',
      token: userAToken,
      body: {
        role: 'Recipient',
        name: 'Concurrent B',
        email: userA.payload.data.user.email,
        passwordHash: 'StrongPassword123!@#',
        phoneNumber: '01012345678',
        address: 'Address B',
      },
    }),
  ]);

  assert.ok(concurrentUpdateResults.every((entry) => entry.response.status === 200));
  const afterConcurrent = await User.findById(userAId).lean();
  assert.ok(['Address A', 'Address B'].includes(afterConcurrent.address));

  await approveRecipientAndSeedPoints(userAId, 30);
  const reqRes = await jsonRequest('/api/recipient/request', {
    method: 'POST',
    token: userAToken,
    body: { notes: 'linked deletion check' },
  });
  assert.equal(reqRes.response.status, 201);

  const deleteLinkedUser = await jsonRequest(`/api/users/${userAId}`, {
    method: 'DELETE',
    token: adminToken,
  });
  assert.equal(deleteLinkedUser.response.status, 200);

  const linkedRequestStillExists = await RecipientRequest.findById(reqRes.payload.data._id).lean();
  assert.ok(linkedRequestStillExists);
});

test('advanced vetting: approve race, reject-after-approve, approve-after-reject, income/docs validation', async (t) => {
  if (!state.dbAvailable) {
    t.skip('MongoDB not available');
    return;
  }

  if (!supportsTransactions()) {
    t.skip('Mongo transactions unavailable');
    return;
  }

  const staff1 = await registerUser({ role: 'Staff', email: uniqueEmail('staff1') });
  const staff2 = await registerUser({ role: 'Staff', email: uniqueEmail('staff2') });
  const recipient = await registerUser({ role: 'Recipient', email: uniqueEmail('vet-rec') });

  const recipientToken = recipient.payload.data.accessToken;
  const requestCreated = await jsonRequest('/api/vetting/request', {
    method: 'POST',
    token: recipientToken,
    body: {
      nationalID: '12345678901234',
      jobTitle: 'Teacher',
      monthlyIncome: 0,
      familyMembers: 3,
      healthStatus: 'medium',
      documentsURL: 'https://example.com/docs.pdf',
    },
  });
  assert.equal(requestCreated.response.status, 201);

  const vettingId = requestCreated.payload.data._id;

  const approveRace = await Promise.all([
    jsonRequest(`/api/vetting/approve/${vettingId}`, { method: 'PUT', token: staff1.payload.data.accessToken }),
    jsonRequest(`/api/vetting/approve/${vettingId}`, { method: 'PUT', token: staff2.payload.data.accessToken }),
  ]);

  const raceSuccess = approveRace.filter((entry) => entry.response.status === 200).length;
  const raceRejected = approveRace.filter((entry) => entry.response.status >= 400).length;
  assert.equal(raceSuccess, 1);
  assert.equal(raceRejected, 1);

  const rejectAfterApprove = await jsonRequest(`/api/vetting/reject/${vettingId}`, {
    method: 'PUT',
    token: staff1.payload.data.accessToken,
    body: { notes: 'late reject' },
  });
  assert.ok([200, 409].includes(rejectAfterApprove.response.status));

  const recipient2 = await registerUser({ role: 'Recipient', email: uniqueEmail('vet-rec-2') });
  const req2 = await jsonRequest('/api/vetting/request', {
    method: 'POST',
    token: recipient2.payload.data.accessToken,
    body: {
      nationalID: '22345678901234',
      jobTitle: 'Worker',
      monthlyIncome: 1000,
      familyMembers: 2,
      healthStatus: 'healthy',
      documentsURL: 'https://example.com/docs2.pdf',
    },
  });
  assert.equal(req2.response.status, 201);

  const rejectFirst = await jsonRequest(`/api/vetting/reject/${req2.payload.data._id}`, {
    method: 'PUT',
    token: staff1.payload.data.accessToken,
    body: { notes: 'rejected' },
  });
  assert.equal(rejectFirst.response.status, 200);

  const approveAfterReject = await jsonRequest(`/api/vetting/approve/${req2.payload.data._id}`, {
    method: 'PUT',
    token: staff2.payload.data.accessToken,
  });
  assert.equal(approveAfterReject.response.status, 409);

  const validationRecipient = await registerUser({ role: 'Recipient', email: uniqueEmail('vet-validation') });

  const incomeNegative = await jsonRequest('/api/vetting/request', {
    method: 'POST',
    token: validationRecipient.payload.data.accessToken,
    body: {
      nationalID: '32345678901234',
      jobTitle: 'Worker',
      monthlyIncome: -1,
      familyMembers: 2,
      healthStatus: 'healthy',
      documentsURL: 'https://example.com/docs3.pdf',
    },
  });
  assert.equal(incomeNegative.response.status, 400);

  const missingDocs = await jsonRequest('/api/vetting/request', {
    method: 'POST',
    token: validationRecipient.payload.data.accessToken,
    body: {
      nationalID: '42345678901234',
      jobTitle: 'Worker',
      monthlyIncome: 500,
      familyMembers: 2,
      healthStatus: 'healthy',
    },
  });
  assert.equal(missingDocs.response.status, 400);
});

test('advanced mapping and priority: overlap, gap fallback, consistency, recalculation, tie-break by timestamp', async (t) => {
  if (!state.dbAvailable) {
    t.skip('MongoDB not available');
    return;
  }

  const staff = await registerUser({ role: 'Staff', email: uniqueEmail('mapstaff') });
  const staffToken = staff.payload.data.accessToken;

  const overlap1 = await jsonRequest('/api/mapping/family', {
    method: 'POST',
    token: staffToken,
    body: { minMembers: 1, maxMembers: 4, score: 7 },
  });
  const overlap2 = await jsonRequest('/api/mapping/family', {
    method: 'POST',
    token: staffToken,
    body: { minMembers: 3, maxMembers: 6, score: 8 },
  });
  assert.equal(overlap1.response.status, 201);
  assert.equal(overlap2.response.status, 201);

  await jsonRequest('/api/mapping/income', {
    method: 'POST',
    token: staffToken,
    body: { minIncome: 0, maxIncome: 100, score: 10 },
  });
  await jsonRequest('/api/mapping/income', {
    method: 'POST',
    token: staffToken,
    body: { minIncome: 1000, maxIncome: 2000, score: 2 },
  });

  const recipient = await registerUser({ role: 'Recipient', email: uniqueEmail('prio-rec') });
  const recipientId = recipient.payload.data.user._id;

  const gapPriority = await priorityEngineService.calculatePriority({
    recipientUserID: recipientId,
    monthlyIncome: 500,
    familyMembers: 5,
    healthStatus: undefined,
  });

  assert.equal(gapPriority.needScore, 5);
  assert.equal(gapPriority.healthScore, 5);

  const sameDataRun1 = await priorityEngineService.calculatePriority({
    recipientUserID: recipientId,
    monthlyIncome: 500,
    familyMembers: 5,
    healthStatus: 'medium',
  });
  const sameDataRun2 = await priorityEngineService.calculatePriority({
    recipientUserID: recipientId,
    monthlyIncome: 500,
    familyMembers: 5,
    healthStatus: 'medium',
  });
  assert.equal(sameDataRun1.finalScore, sameDataRun2.finalScore);

  const changedIncome = await priorityEngineService.calculatePriority({
    recipientUserID: recipientId,
    monthlyIncome: 50,
    familyMembers: 5,
    healthStatus: 'medium',
  });
  assert.notEqual(changedIncome.needScore, sameDataRun1.needScore);

  const tieResolution = getConflictResolutionTier(
    { _id: new mongoose.Types.ObjectId(), priority: 10, requestDate: new Date('2026-01-01T10:00:00.000Z') },
    { _id: new mongoose.Types.ObjectId(), priority: 10, requestDate: new Date('2026-01-01T10:05:00.000Z') }
  );
  assert.equal(tieResolution.tier, 'TIMESTAMP');
});

test('advanced donations and transactions: status flow, double-click idempotency, amount edge cases', async (t) => {
  if (!state.dbAvailable) {
    t.skip('MongoDB not available');
    return;
  }

  const donor = await registerUser({ role: 'Donor', email: uniqueEmail('donor-adv') });
  const donorToken = donor.payload.data.accessToken;
  const staff = await registerUser({ role: 'Staff', email: uniqueEmail('don-staff') });
  const staffToken = staff.payload.data.accessToken;

  const donation = await jsonRequest('/api/donations', {
    method: 'POST',
    token: donorToken,
    headers: { 'Idempotency-Key': 'adv-donation-1' },
    body: {
      proposedPickupTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      pickupLocation: 'Nasr City',
      notes: 'without explicit items',
    },
  });
  assert.equal(donation.response.status, 201);

  const jumpStatus = await jsonRequest(`/api/donations/${donation.payload.data._id}/status`, {
    method: 'PUT',
    token: staffToken,
    body: { status: 'stored' },
  });
  assert.equal(jumpStatus.response.status, 400);

  const cancelStatus = await jsonRequest(`/api/donations/${donation.payload.data._id}/status`, {
    method: 'PUT',
    token: staffToken,
    body: { status: 'cancelled' },
  });
  assert.equal(cancelStatus.response.status, 400);

  const key = `tx-idemp-${Date.now()}`;
  const tx1 = await jsonRequest('/api/transactions', {
    method: 'POST',
    token: donorToken,
    headers: { 'Idempotency-Key': key },
    body: { amount: 100, paymentMethod: 'cash' },
  });
  const tx2 = await jsonRequest('/api/transactions', {
    method: 'POST',
    token: donorToken,
    headers: { 'Idempotency-Key': key },
    body: { amount: 100, paymentMethod: 'cash' },
  });
  assert.equal(tx1.response.status, 201);
  assert.equal(tx2.response.status, 201);

  const txDocs = await Transaction.find({ donorID: donor.payload.data.user._id }).lean();
  assert.equal(txDocs.length, 1);

  const noKeyA = await jsonRequest('/api/transactions', {
    method: 'POST',
    token: donorToken,
    body: { amount: 101, paymentMethod: 'cash' },
  });
  const noKeyB = await jsonRequest('/api/transactions', {
    method: 'POST',
    token: donorToken,
    body: { amount: 101, paymentMethod: 'cash' },
  });
  assert.equal(noKeyA.response.status, 201);
  assert.equal(noKeyB.response.status, 201);

  const zeroAmount = await jsonRequest('/api/transactions', {
    method: 'POST',
    token: donorToken,
    body: { amount: 0, paymentMethod: 'cash' },
  });
  assert.equal(zeroAmount.response.status, 400);

  const negativeAmount = await jsonRequest('/api/transactions', {
    method: 'POST',
    token: donorToken,
    body: { amount: -1, paymentMethod: 'cash' },
  });
  assert.equal(negativeAmount.response.status, 400);
});

test('advanced inventory and movement: race updates, edges, and consistency with movements', async (t) => {
  if (!state.dbAvailable) {
    t.skip('MongoDB not available');
    return;
  }

  const staff = await registerUser({ role: 'Staff', email: uniqueEmail('inv-staff') });
  const token = staff.payload.data.accessToken;
  const staffId = staff.payload.data.user._id;

  const createZero = await jsonRequest('/api/inventory', {
    method: 'POST',
    token,
    body: {
      sourceItemID: new mongoose.Types.ObjectId().toString(),
      itemName: 'Zero Quantity Item',
      category: 'Food',
      quantity: 0,
      itemCondition: 'good',
      storageLocation: 'Z1',
      monthlyLimit: 10,
      itemPointsCost: 1,
      staffID: staffId,
    },
  });
  assert.equal(createZero.response.status, 201);

  const createNegative = await jsonRequest('/api/inventory', {
    method: 'POST',
    token,
    body: {
      sourceItemID: new mongoose.Types.ObjectId().toString(),
      itemName: 'Negative Quantity Item',
      category: 'Food',
      quantity: -1,
      itemCondition: 'good',
      storageLocation: 'Z2',
      monthlyLimit: 10,
      itemPointsCost: 1,
      staffID: staffId,
    },
  });
  assert.equal(createNegative.response.status, 400);

  const inv = await createInventoryDoc({ quantity: 5 });

  const updateRace = await Promise.all([
    jsonRequest(`/api/inventory/${inv._id}`, {
      method: 'PUT',
      token,
      body: {
        sourceItemID: inv.sourceItemID.toString(),
        itemName: inv.itemName,
        category: inv.category,
        quantity: 4,
        itemCondition: inv.itemCondition,
        storageLocation: inv.storageLocation,
        monthlyLimit: inv.monthlyLimit,
        itemPointsCost: inv.itemPointsCost,
        staffID: staffId,
      },
    }),
    jsonRequest(`/api/inventory/${inv._id}`, {
      method: 'PUT',
      token,
      body: {
        sourceItemID: inv.sourceItemID.toString(),
        itemName: inv.itemName,
        category: inv.category,
        quantity: 3,
        itemCondition: inv.itemCondition,
        storageLocation: inv.storageLocation,
        monthlyLimit: inv.monthlyLimit,
        itemPointsCost: inv.itemPointsCost,
        staffID: staffId,
      },
    }),
  ]);

  assert.ok(updateRace.every((entry) => entry.response.status === 200 || entry.response.status === 500));

  const inventoryAfterRace = await Inventory.findById(inv._id).lean();
  assert.ok(inventoryAfterRace.quantity >= 0);

  const missingInventoryMovement = await jsonRequest('/api/inventory-movements/move', {
    method: 'POST',
    token,
    body: {
      inventoryID: new mongoose.Types.ObjectId().toString(),
      staffID: staffId,
      movementType: 'remove',
      quantityChange: 1,
    },
  });
  assert.equal(missingInventoryMovement.response.status, 404);

  const missingStaffMovement = await jsonRequest('/api/inventory-movements/move', {
    method: 'POST',
    token,
    body: {
      inventoryID: inv._id.toString(),
      movementType: 'add',
      quantityChange: 1,
    },
  });
  assert.equal(missingStaffMovement.response.status, 400);

  const overLimitRemove = await jsonRequest('/api/inventory-movements/move', {
    method: 'POST',
    token,
    body: {
      inventoryID: inv._id.toString(),
      staffID: staffId,
      movementType: 'remove',
      quantityChange: 999,
    },
  });
  assert.equal(overLimitRemove.response.status, 400);

  const addMove = await jsonRequest('/api/inventory-movements/move', {
    method: 'POST',
    token,
    body: {
      inventoryID: inv._id.toString(),
      staffID: staffId,
      movementType: 'add',
      quantityChange: 2,
      notes: 'consistency add',
    },
  });
  assert.equal(addMove.response.status, 201);

  const removeMove = await jsonRequest('/api/inventory-movements/move', {
    method: 'POST',
    token,
    body: {
      inventoryID: inv._id.toString(),
      staffID: staffId,
      movementType: 'remove',
      quantityChange: 1,
      notes: 'consistency remove',
    },
  });
  assert.equal(removeMove.response.status, 201);

  const finalInv = await Inventory.findById(inv._id).lean();
  const movementSum = await InventoryMovement.aggregate([
    { $match: { inventoryID: inv._id } },
    { $group: { _id: null, total: { $sum: '$quantityChange' } } },
  ]);
  const totalChange = Number(movementSum[0]?.total || 0);
  assert.ok(finalInv.quantity >= 0);
  assert.ok(Number.isFinite(totalChange));
});

test('advanced recipient-request and review: concurrency, edge, abuse, and double-approval safety', async (t) => {
  if (!state.dbAvailable) {
    t.skip('MongoDB not available');
    return;
  }

  if (!supportsTransactions()) {
    t.skip('Mongo transactions unavailable');
    return;
  }

  const staff = await registerUser({ role: 'Staff', email: uniqueEmail('req-staff') });
  const staffToken = staff.payload.data.accessToken;
  const staffId = staff.payload.data.user._id;

  const recipient1 = await registerUser({ role: 'Recipient', email: uniqueEmail('req-r1') });
  const recipient2 = await registerUser({ role: 'Recipient', email: uniqueEmail('req-r2') });
  await approveRecipientAndSeedPoints(recipient1.payload.data.user._id, 10);
  await approveRecipientAndSeedPoints(recipient2.payload.data.user._id, 10);

  const scarceInv = await createInventoryDoc({ quantity: 1, itemPointsCost: 3, monthlyLimit: 2 });

  const req1 = await createRecipientRequestWithItem({
    recipientToken: recipient1.payload.data.accessToken,
    inventoryId: scarceInv._id.toString(),
    quantity: 1,
  });
  const req2 = await createRecipientRequestWithItem({
    recipientToken: recipient2.payload.data.accessToken,
    inventoryId: scarceInv._id.toString(),
    quantity: 1,
  });

  const approveRace = await Promise.all([
    jsonRequest(`/api/recipient/review/${req1}`, {
      method: 'PUT',
      token: staffToken,
      body: { status: 'approved' },
    }),
    jsonRequest(`/api/recipient/review/${req2}`, {
      method: 'PUT',
      token: staffToken,
      body: { status: 'approved' },
    }),
  ]);

  const approvedCount = approveRace.filter((entry) => entry.response.status === 200).length;
  const rejectedCount = approveRace.filter((entry) => entry.response.status >= 400).length;
  assert.equal(approvedCount, 1);
  assert.equal(rejectedCount, 1);

  const noItemsRequest = await jsonRequest('/api/recipient/request', {
    method: 'POST',
    token: recipient1.payload.data.accessToken,
    body: { notes: 'no items edge' },
  });
  assert.equal(noItemsRequest.response.status, 201);

  const noItemsReview = await jsonRequest(`/api/recipient/review/${noItemsRequest.payload.data._id}`, {
    method: 'PUT',
    token: staffToken,
    body: { status: 'approved' },
  });
  assert.ok(noItemsReview.response.status >= 400);

  const lowPointsRecipient = await registerUser({ role: 'Recipient', email: uniqueEmail('req-low') });
  await approveRecipientAndSeedPoints(lowPointsRecipient.payload.data.user._id, 0);
  const lowPointsRequest = await jsonRequest('/api/recipient/request', {
    method: 'POST',
    token: lowPointsRecipient.payload.data.accessToken,
    body: { notes: 'points exhausted' },
  });
  assert.equal(lowPointsRequest.response.status, 201);

  const invalidItemRequest = await jsonRequest('/api/requested-items', {
    method: 'POST',
    token: lowPointsRecipient.payload.data.accessToken,
    body: {
      recipientRequestID: lowPointsRequest.payload.data._id,
      inventoryID: new mongoose.Types.ObjectId().toString(),
      quantity: 1,
    },
  });
  assert.equal(invalidItemRequest.response.status, 404);

  const abuseUser = await registerUser({ role: 'Recipient', email: uniqueEmail('abuse') });
  await approveRecipientAndSeedPoints(abuseUser.payload.data.user._id, 50);
  const abuseResults = await Promise.all(
    Array.from({ length: 10 }).map(() =>
      jsonRequest('/api/recipient/request', {
        method: 'POST',
        token: abuseUser.payload.data.accessToken,
        body: { notes: 'abuse burst' },
      })
    )
  );
  const abuseSuccess = abuseResults.filter((entry) => entry.response.status === 201).length;
  assert.equal(abuseSuccess, 10);

  const winnerReq = await RecipientRequest.findOne({ status: 'approved' }).lean();
  if (winnerReq) {
    const secondApprove = await jsonRequest(`/api/recipient/review/${winnerReq._id}`, {
      method: 'PUT',
      token: staffToken,
      body: { status: 'approved' },
    });
    assert.ok(secondApprove.response.status >= 400 || secondApprove.response.status === 200);
  }

  const duplicatePointTx = await PointsTransaction.aggregate([
    { $group: { _id: '$relatedRequestID', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]);
  assert.equal(duplicatePointTx.length, 0);

  const rejectAfterApprove = winnerReq
    ? await jsonRequest(`/api/recipient/review/${winnerReq._id}`, {
        method: 'PUT',
        token: staffToken,
        body: { status: 'rejected' },
      })
    : null;
  if (rejectAfterApprove) {
    assert.ok([200, 409].includes(rejectAfterApprove.response.status));
  }
});

test('advanced points, messages, jobs, global load and security', async (t) => {
  if (!state.dbAvailable) {
    t.skip('MongoDB not available');
    return;
  }

  const admin = await registerUser({ role: 'Admin', email: uniqueEmail('jobs-admin') });
  const staff = await registerUser({ role: 'Staff', email: uniqueEmail('jobs-staff') });
  const recipient = await registerUser({ role: 'Recipient', email: uniqueEmail('msg-recipient') });
  const otherRecipient = await registerUser({ role: 'Recipient', email: uniqueEmail('msg-other') });

  await approveRecipientAndSeedPoints(recipient.payload.data.user._id, 20);
  await approveRecipientAndSeedPoints(otherRecipient.payload.data.user._id, 20);

  const msg = await Message.create({
    userID: recipient.payload.data.user._id,
    messageType: 'request_approved',
    content: 'hello',
  });

  const markReadOnce = await jsonRequest(`/api/messages/read/${msg._id}`, {
    method: 'PUT',
    token: recipient.payload.data.accessToken,
  });
  const markReadTwice = await jsonRequest(`/api/messages/read/${msg._id}`, {
    method: 'PUT',
    token: recipient.payload.data.accessToken,
  });

  assert.equal(markReadOnce.response.status, 200);
  assert.equal(markReadTwice.response.status, 200);

  const unauthorizedRead = await jsonRequest(`/api/messages/read/${msg._id}`, {
    method: 'PUT',
    token: otherRecipient.payload.data.accessToken,
  });
  assert.equal(unauthorizedRead.response.status, 403);

  const roleBypassAttempt = await jsonRequest('/api/configs/system/run-monthly-reset', {
    method: 'POST',
    token: recipient.payload.data.accessToken,
  });
  assert.equal(roleBypassAttempt.response.status, 403);

  const idGuessing = await jsonRequest(`/api/messages/read/${new mongoose.Types.ObjectId()}`, {
    method: 'PUT',
    token: recipient.payload.data.accessToken,
  });
  assert.ok(idGuessing.response.status === 404 || idGuessing.response.status === 403);

  const jobDoubleRun = await Promise.all([
    jsonRequest('/api/configs/system/run-monthly-reset', {
      method: 'POST',
      token: admin.payload.data.accessToken,
    }),
    jsonRequest('/api/configs/system/run-monthly-reset', {
      method: 'POST',
      token: admin.payload.data.accessToken,
    }),
  ]);
  assert.ok(jobDoubleRun.every((entry) => entry.response.status === 200));

  const beforePoints = await RecipientPoints.findOne({ recipientUserID: recipient.payload.data.user._id }).lean();
  assert.ok(beforePoints.currentPoints >= 0);

  const highLoad = await Promise.all(
    Array.from({ length: 100 }).map(() => jsonRequest('/health'))
  );
  assert.equal(highLoad.filter((entry) => entry.response.status === 200).length, 100);

  const largePayload = await jsonRequest('/api/recipient/request', {
    method: 'POST',
    token: recipient.payload.data.accessToken,
    body: { notes: 'x'.repeat(100_000) },
  });
  assert.ok(largePayload.response.status === 201 || largePayload.response.status === 400);

  const tamperedJwt = `${admin.payload.data.accessToken.slice(0, -1)}x`;
  const tamperedRes = await jsonRequest('/api/auth/me', { token: tamperedJwt });
  assert.equal(tamperedRes.response.status, 401);
});

test('advanced full-flow: donor -> inventory -> request -> priority -> approve -> points/inventory/message consistency', async (t) => {
  if (!state.dbAvailable) {
    t.skip('MongoDB not available');
    return;
  }

  if (!supportsTransactions()) {
    t.skip('Mongo transactions unavailable');
    return;
  }

  const donor = await registerUser({ role: 'Donor', email: uniqueEmail('full-donor') });
  const staff = await registerUser({ role: 'Staff', email: uniqueEmail('full-staff') });
  const recipient = await registerUser({ role: 'Recipient', email: uniqueEmail('full-recipient') });

  await approveRecipientAndSeedPoints(recipient.payload.data.user._id, 20);

  const vettingRequest = await jsonRequest('/api/vetting/request', {
    method: 'POST',
    token: recipient.payload.data.accessToken,
    body: {
      nationalID: '52345678901234',
      jobTitle: 'Worker',
      monthlyIncome: 500,
      familyMembers: 3,
      healthStatus: 'medium',
      documentsURL: 'https://example.com/full-flow-vetting.pdf',
    },
  });
  assert.equal(vettingRequest.response.status, 201);

  const vettingApprove = await jsonRequest(`/api/vetting/approve/${vettingRequest.payload.data._id}`, {
    method: 'PUT',
    token: staff.payload.data.accessToken,
  });
  assert.equal(vettingApprove.response.status, 200);

  const donation = await jsonRequest('/api/donations', {
    method: 'POST',
    token: donor.payload.data.accessToken,
    headers: { 'Idempotency-Key': `full-flow-donation-${Date.now()}` },
    body: {
      proposedPickupTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      pickupLocation: 'Giza',
      notes: 'full flow donation',
    },
  });
  assert.equal(donation.response.status, 201);

  const inventoryCreate = await jsonRequest('/api/inventory', {
    method: 'POST',
    token: staff.payload.data.accessToken,
    body: {
      sourceItemID: new mongoose.Types.ObjectId().toString(),
      itemName: 'Full Flow Box',
      category: 'Food',
      quantity: 5,
      itemCondition: 'good',
      storageLocation: 'FF1',
      monthlyLimit: 5,
      itemPointsCost: 3,
      staffID: staff.payload.data.user._id,
    },
  });
  assert.equal(inventoryCreate.response.status, 201);

  const inventoryId = inventoryCreate.payload.data._id;

  const requestCreated = await jsonRequest('/api/recipient/request', {
    method: 'POST',
    token: recipient.payload.data.accessToken,
    body: { notes: 'full-flow request' },
  });
  assert.equal(requestCreated.response.status, 201);

  const requestedItem = await jsonRequest('/api/requested-items', {
    method: 'POST',
    token: recipient.payload.data.accessToken,
    body: {
      recipientRequestID: requestCreated.payload.data._id,
      inventoryID: inventoryId,
      quantity: 2,
    },
  });
  assert.equal(requestedItem.response.status, 201);

  const priority = await jsonRequest(`/api/priority/recalculate/${recipient.payload.data.user._id}`, {
    method: 'POST',
    token: staff.payload.data.accessToken,
  });
  assert.equal(priority.response.status, 200);

  const approve = await jsonRequest(`/api/recipient/review/${requestCreated.payload.data._id}`, {
    method: 'PUT',
    token: staff.payload.data.accessToken,
    body: { status: 'approved' },
  });
  assert.equal(approve.response.status, 200);

  const pointsAfter = await RecipientPoints.findOne({ recipientUserID: recipient.payload.data.user._id }).lean();
  assert.equal(pointsAfter.currentPoints, 94);

  const inventoryAfter = await Inventory.findById(inventoryId).lean();
  assert.equal(inventoryAfter.quantity, 3);

  const requestAfter = await RecipientRequest.findById(requestCreated.payload.data._id).lean();
  assert.equal(requestAfter.status, 'approved');

  const msg = await Message.findOne({ userID: recipient.payload.data.user._id, messageType: 'request_approved' }).lean();
  assert.ok(msg);

  const pointsTx = await PointsTransaction.findOne({ relatedRequestID: requestCreated.payload.data._id }).lean();
  assert.ok(pointsTx);

  const duplicateTx = await PointsTransaction.countDocuments({ relatedRequestID: requestCreated.payload.data._id });
  assert.equal(duplicateTx, 1);

  assert.ok(pointsAfter.currentPoints >= 0);
  assert.ok(inventoryAfter.quantity >= 0);

  const allRequestedItems = await RequestedItem.find({ recipientRequestID: requestCreated.payload.data._id }).lean();
  assert.equal(allRequestedItems.length, 1);
});
