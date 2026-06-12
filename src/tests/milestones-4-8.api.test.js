const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const {
  initializeGlobalMongo,
  cleanupGlobalMongo,
  getGlobalUri,
  isSetupComplete,
} = require("./globalSetup");
const {
  resetIntegrationMongo,
  supportsTransactions,
} = require("./integrationMongoSetup");

const RecipientPriority = require("../models/recipientPriorityModel");
const VettingRequest = require("../models/vettingRequestModel");
const Inventory = require("../models/inventoryModel");
const DonationReq = require("../models/donationReqModel");

const state = {
  dbAvailable: false,
  app: null,
  server: null,
  baseUrl: null,
};

const jsonRequest = async (
  path,
  { method = "GET", token = null, body = undefined } = {},
) => {
  const headers = { Accept: "application/json" };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
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
    role: "Recipient",
    name: "Test User",
    email: `user-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
    passwordHash: "StrongPassword123",
    phoneNumber: "01012345678",
    address: "Cairo",
    ...overrides,
  };

  return jsonRequest("/api/auth/register", { method: "POST", body: payload });
};

test.before(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

  try {
    await initializeGlobalMongo();
    state.dbAvailable = isSetupComplete();
    process.env.MONGO_URI = getGlobalUri();

    const appModule = require("../app");
    state.app = appModule.app || appModule;
    state.server = state.app.listen(0);
    await new Promise((resolve) => state.server.once("listening", resolve));
    const { port } = state.server.address();
    state.baseUrl = `http://127.0.0.1:${port}`;
  } catch (error) {
    console.error("[Test] Failed to initialize test server:", error.message);
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

test("milestone 4 - mapping API: success, validation, role", async (t) => {
  if (!state.dbAvailable) {
    t.skip("MongoDB server is not available for integration testing");
    return;
  }

  const staffRegistration = await registerUser({
    role: "Staff",
    email: "map-staff@example.com",
  });
  const staffToken = staffRegistration.payload.data.accessToken;

  const donorRegistration = await registerUser({
    role: "Donor",
    email: "map-donor@example.com",
  });
  const donorToken = donorRegistration.payload.data.accessToken;

  const success = await jsonRequest("/api/mapping/family", {
    method: "POST",
    token: staffToken,
    body: {
      minMembers: 1,
      maxMembers: 4,
      score: 7,
    },
  });
  assert.equal(success.response.status, 201);
  assert.equal(success.payload.success, true);
  assert.equal(success.payload.data.score, 7);

  const invalidRange = await jsonRequest("/api/mapping/family", {
    method: "POST",
    token: staffToken,
    body: {
      minMembers: -1,
      maxMembers: 3,
      score: 5,
    },
  });
  assert.equal(invalidRange.response.status, 400);

  const forbidden = await jsonRequest("/api/mapping/family", {
    method: "POST",
    token: donorToken,
    body: {
      minMembers: 2,
      maxMembers: 5,
      score: 6,
    },
  });
  assert.equal(forbidden.response.status, 403);
});

test("milestone 5 - priority APIs: get user, ranked, recalculate, missing mapping edge", async (t) => {
  if (!state.dbAvailable) {
    t.skip("MongoDB server is not available for integration testing");
    return;
  }

  if (!supportsTransactions()) {
    t.skip("MongoDB transactions require replica set support");
    return;
  }

  const staffRegistration = await registerUser({
    role: "Staff",
    email: "priority-staff@example.com",
  });
  const staffToken = staffRegistration.payload.data.accessToken;

  const recipientA = await registerUser({
    role: "Recipient",
    email: "priority-a@example.com",
  });
  const recipientAId = recipientA.payload.data.user._id;

  const recipientB = await registerUser({
    role: "Recipient",
    email: "priority-b@example.com",
  });
  const recipientBId = recipientB.payload.data.user._id;

  await RecipientPriority.create([
    {
      recipientUserID: recipientAId,
      needScore: 7,
      familyScore: 7,
      healthScore: 7,
      lastAidScore: 7,
      finalScore: 7,
      lastCalculated: new Date("2026-01-01T00:00:00Z"),
    },
    {
      recipientUserID: recipientBId,
      needScore: 3,
      familyScore: 3,
      healthScore: 3,
      lastAidScore: 3,
      finalScore: 3,
      lastCalculated: new Date("2026-01-01T00:00:00Z"),
    },
  ]);

  const getSuccess = await jsonRequest(`/api/priority/${recipientAId}`, {
    token: staffToken,
  });
  assert.equal(getSuccess.response.status, 200);
  assert.equal(getSuccess.payload.success, true);
  assert.equal(getSuccess.payload.data.recipientUserID._id, recipientAId);

  const notFoundId = new mongoose.Types.ObjectId().toString();
  const getNotFound = await jsonRequest(`/api/priority/${notFoundId}`, {
    token: staffToken,
  });
  assert.equal(getNotFound.response.status, 404);

  const ranked = await jsonRequest("/api/priority/ranked", {
    token: staffToken,
  });
  assert.equal(ranked.response.status, 200);
  assert.equal(ranked.payload.success, true);
  assert.ok(Array.isArray(ranked.payload.data));
  assert.ok(ranked.payload.data.length >= 2);
  assert.ok(
    ranked.payload.data[0].finalScore >= ranked.payload.data[1].finalScore,
  );

  const recipientC = await registerUser({
    role: "Recipient",
    email: "priority-c@example.com",
  });
  const recipientCId = recipientC.payload.data.user._id;

  await VettingRequest.create({
    recipientUserID: recipientCId,
    nationalID: "99999999999999",
    jobTitle: "Worker",
    monthlyIncome: 1800,
    familyMembers: 3,
    healthStatus: "healthy",
    documentsURL: ["https://example.com/doc-c.pdf"],
    vettingStatus: "approved",
    reviewedByStaffID: new mongoose.Types.ObjectId(),
    reviewDate: new Date(),
  });

  const recalculated = await jsonRequest(
    `/api/priority/recalculate/${recipientCId}`,
    {
      method: "POST",
      token: staffToken,
    },
  );
  assert.equal(recalculated.response.status, 200);
  assert.equal(recalculated.payload.success, true);

  // Edge case: when mapping tables are empty, engine falls back to default scores.
  assert.equal(recalculated.payload.data.needScore, 5);
  assert.equal(recalculated.payload.data.familyScore, 5);
  assert.equal(recalculated.payload.data.healthScore, 5);
  assert.equal(recalculated.payload.data.lastAidScore, 5);
});

test("milestone 6 - donation APIs: create, validation-like required fields, status update and invalid status", async (t) => {
  if (!state.dbAvailable) {
    t.skip("MongoDB server is not available for integration testing");
    return;
  }

  if (!supportsTransactions()) {
    t.skip("MongoDB transactions require replica set support");
    return;
  }

  const donorRegistration = await registerUser({
    role: "Donor",
    email: "donor-m6@example.com",
  });
  const donorToken = donorRegistration.payload.data.accessToken;

  const staffRegistration = await registerUser({
    role: "Staff",
    email: "staff-m6@example.com",
  });
  const staffToken = staffRegistration.payload.data.accessToken;

  const created = await jsonRequest("/api/donations", {
    method: "POST",
    token: donorToken,
    body: {
      proposedPickupTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      pickupLocation: "Nasr City",
      notes: "Milestone 6 donation",
    },
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.payload.success, true);

  const stored = await DonationReq.findById(created.payload.data._id).lean();
  assert.ok(stored);

  const missingRequired = await jsonRequest("/api/donations", {
    method: "POST",
    token: donorToken,
    body: {
      proposedPickupTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      notes: "missing pickupLocation",
    },
  });
  assert.equal(missingRequired.response.status, 400);

  const statusUpdated = await jsonRequest(
    `/api/donations/${created.payload.data._id}/status`,
    {
      method: "PUT",
      token: staffToken,
      body: {
        status: "pickedUp",
      },
    },
  );
  assert.equal(statusUpdated.response.status, 200);
  assert.equal(statusUpdated.payload.data.status, "pickedUp");

  const invalidStatus = await jsonRequest(
    `/api/donations/${created.payload.data._id}/status`,
    {
      method: "PUT",
      token: staffToken,
      body: {
        status: "unknown-status",
      },
    },
  );
  assert.equal(invalidStatus.response.status, 400);
});

test("milestone 7 - inventory APIs: list, low-stock, and negative quantity error", async (t) => {
  if (!state.dbAvailable) {
    t.skip("MongoDB server is not available for integration testing");
    return;
  }

  if (!supportsTransactions()) {
    t.skip("MongoDB transactions require replica set support");
    return;
  }

  const staffRegistration = await registerUser({
    role: "Staff",
    email: "staff-m7@example.com",
  });
  const staffToken = staffRegistration.payload.data.accessToken;
  const staffId = staffRegistration.payload.data.user._id;

  await Inventory.create([
    {
      sourceItemID: new mongoose.Types.ObjectId(),
      itemName: "Rice",
      category: "Food",
      quantity: 4,
      itemCondition: "good",
      storageLocation: "A1",
      monthlyLimit: 20,
      itemPointsCost: 2,
    },
    {
      sourceItemID: new mongoose.Types.ObjectId(),
      itemName: "Blanket",
      category: "Aid",
      quantity: 40,
      itemCondition: "excellent",
      storageLocation: "B2",
      monthlyLimit: 10,
      itemPointsCost: 4,
    },
  ]);

  const inventoryList = await jsonRequest("/api/inventory", {
    token: staffToken,
  });
  assert.equal(inventoryList.response.status, 200);
  assert.equal(inventoryList.payload.success, true);
  assert.ok(Array.isArray(inventoryList.payload.data));
  assert.ok(inventoryList.payload.data.length >= 2);

  const lowStock = await jsonRequest("/api/inventory/low-stock", {
    token: staffToken,
  });
  assert.equal(lowStock.response.status, 200);
  assert.equal(lowStock.payload.success, true);
  assert.ok(Array.isArray(lowStock.payload.data));
  assert.ok(lowStock.payload.data.some((x) => x.itemName === "Rice"));

  const negativeQuantity = await jsonRequest("/api/inventory", {
    method: "POST",
    token: staffToken,
    body: {
      sourceItemID: new mongoose.Types.ObjectId().toString(),
      itemName: "Pasta",
      category: "Food",
      quantity: -2,
      itemCondition: "good",
      storageLocation: "C3",
      monthlyLimit: 30,
      itemPointsCost: 1,
      staffID: staffId,
      movementNotes: "invalid test",
    },
  });
  assert.equal(negativeQuantity.response.status, 400);
});

test("milestone 8 - inventory movement APIs: success and quantity exceeds available", async (t) => {
  if (!state.dbAvailable) {
    t.skip("MongoDB server is not available for integration testing");
    return;
  }

  if (!supportsTransactions()) {
    t.skip("MongoDB transactions require replica set support");
    return;
  }

  const staffRegistration = await registerUser({
    role: "Staff",
    email: "staff-m8@example.com",
  });
  const staffToken = staffRegistration.payload.data.accessToken;
  const staffId = staffRegistration.payload.data.user._id;

  const inv = await Inventory.create({
    sourceItemID: new mongoose.Types.ObjectId(),
    itemName: "Oil",
    category: "Food",
    quantity: 10,
    itemCondition: "good",
    storageLocation: "D4",
    monthlyLimit: 25,
    itemPointsCost: 3,
  });

  const moved = await jsonRequest("/api/inventory-movements/move", {
    method: "POST",
    token: staffToken,
    body: {
      inventoryID: inv._id.toString(),
      staffID: staffId,
      movementType: "remove",
      quantityChange: 3,
      notes: "Pack dispatch",
    },
  });
  assert.equal(moved.response.status, 201);
  assert.equal(moved.payload.success, true);
  assert.equal(moved.payload.data.quantityChange, -3);

  const overMove = await jsonRequest("/api/inventory-movements/move", {
    method: "POST",
    token: staffToken,
    body: {
      inventoryID: inv._id.toString(),
      staffID: staffId,
      movementType: "remove",
      quantityChange: 100,
      notes: "Over remove",
    },
  });
  assert.equal(overMove.response.status, 400);
});
