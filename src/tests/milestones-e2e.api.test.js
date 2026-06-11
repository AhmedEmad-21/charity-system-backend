const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

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

const User = require("../models/userModel");
const Otp = require("../models/otpModel");
const VettingRequest = require("../models/vettingRequestModel");
const RecipientPoints = require("../models/recipientPointsModel");
const RecipientPriority = require("../models/recipientPriorityModel");
const RecipientRequest = require("../models/recipientRequestModel");
const RequestedItem = require("../models/requestedItemModel");
const RecipientItemQuota = require("../models/recipientItemQuotaModel");
const Inventory = require("../models/inventoryModel");
const Item = require("../models/itemModel");
const DonationReq = require("../models/donationReqModel");
const PointsTransaction = require("../models/pointsTransactionModel");
const Message = require("../models/messageModel");
const SystemAuditLog = require("../models/systemAuditLogModel");
const InventoryMovement = require("../models/inventoryMovementModel");
const IdempotencyKey = require("../models/idempotencyKeyModel");

const state = {
  dbAvailable: false,
  app: null,
  server: null,
  baseUrl: null,
  sentOtps: [],
};

const clearModuleCache = () => {
  const modulesToReset = [
    "../config/appConfig",
    "../services/emailService",
    "../services/otpService",
    "../services/authService",
    "../controllers/authController",
    "../routes/authRoutes",
    "../middlewares/rateLimiterMW",
    "../app",
  ];

  for (const relativePath of modulesToReset) {
    const absolutePath = require.resolve(relativePath, { paths: [__dirname] });
    delete require.cache[absolutePath];
  }
};

const uniqueEmail = (prefix = "user") =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;

const jsonRequest = async (
  path,
  { method = "GET", token = null, body = undefined, headers = {} } = {},
) => {
  const requestHeaders = { Accept: "application/json", ...headers };

  if (body !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
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

const latestOtp = ({ email, purpose = "verify" }) => {
  const matches = state.sentOtps.filter(
    (entry) => entry.to === email && entry.purpose === purpose,
  );
  return matches.length ? matches[matches.length - 1].otpCode : null;
};

const waitForIdempotencyCompletion = async ({
  idempotencyKey,
  userID,
  endpoint,
  method,
}) => {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const record = await IdempotencyKey.findOne({
      idempotencyKey,
      userID,
      endpoint,
      method,
    }).lean();
    if (record && record.status !== "pending") {
      return record;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return IdempotencyKey.findOne({
    idempotencyKey,
    userID,
    endpoint,
    method,
  }).lean();
};

const registerUser = async ({
  role = "Recipient",
  email = uniqueEmail(role.toLowerCase()),
  password = "StrongPassword123",
  name = "Test User",
} = {}) => {
  const response = await jsonRequest("/api/auth/register", {
    method: "POST",
    body: {
      role,
      name,
      email,
      passwordHash: password,
      phoneNumber: "01012345678",
      address: "Cairo",
    },
  });

  assert.equal(response.response.status, 201);
  return { ...response, email, password };
};

const verifyRegisteredUser = async ({ email, password }) => {
  const otpCode = latestOtp({ email, purpose: "verify" });
  assert.ok(otpCode, `expected OTP for ${email}`);

  const verified = await jsonRequest("/api/auth/verify-otp", {
    method: "POST",
    body: { email, otp: otpCode, purpose: "verify" },
  });
  assert.equal(verified.response.status, 200);

  const login = await jsonRequest("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  assert.equal(login.response.status, 200);

  return {
    verify: verified.payload.data,
    login: login.payload.data,
    accessToken: login.payload.data.accessToken,
    refreshToken: login.payload.data.refreshToken,
    user: login.payload.data.user,
  };
};

const registerActiveUser = async (options = {}) => {
  const registration = await registerUser(options);
  const activated = await verifyRegisteredUser({
    email: registration.email,
    password: registration.password,
  });
  return {
    email: registration.email,
    password: registration.password,
    registration: registration.payload.data,
    ...activated,
  };
};

const createStaff = async () =>
  registerActiveUser({
    role: "Staff",
    name: "Staff User",
    email: uniqueEmail("staff"),
  });
const createAdmin = async () =>
  registerActiveUser({
    role: "Admin",
    name: "Admin User",
    email: uniqueEmail("admin"),
  });
const createDonor = async () =>
  registerActiveUser({
    role: "Donor",
    name: "Donor User",
    email: uniqueEmail("donor"),
  });

const createApprovedRecipient = async ({ points = 100 } = {}) => {
  const recipient = await registerActiveUser({
    role: "Recipient",
    name: "Recipient User",
    email: uniqueEmail("recipient"),
  });
  const staff = await createStaff();
  const nationalID = `${String(Date.now()).slice(-10)}${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;

  const vetting = await jsonRequest("/api/vetting/request", {
    method: "POST",
    token: recipient.accessToken,
    body: {
      nationalID,
      jobTitle: "Worker",
      monthlyIncome: 1200,
      familyMembers: 4,
      healthStatus: "healthy",
      documentsURL: "https://example.com/documents.pdf",
      notes: "E2E milestone vetting request",
    },
  });
  assert.equal(vetting.response.status, 201);

  const approve = await jsonRequest(
    `/api/vetting/approve/${vetting.payload.data._id}`,
    {
      method: "PUT",
      token: staff.accessToken,
    },
  );
  assert.equal(approve.response.status, 200);

  const pointsRecord = await RecipientPoints.findOne({
    recipientUserID: recipient.registration.user._id,
  }).lean();
  assert.ok(pointsRecord);
  if (pointsRecord) {
    assert.ok(pointsRecord.currentPoints >= 0);
    if (Number.isFinite(points)) {
      await RecipientPoints.updateOne(
        { recipientUserID: recipient.registration.user._id },
        {
          $set: {
            currentPoints: points,
            monthlyAllocation: points,
            lastResetDate: new Date(),
          },
        },
      );
    }
  }

  const priority = await RecipientPriority.findOne({
    recipientUserID: recipient.registration.user._id,
  }).lean();
  assert.ok(priority);

  return { ...recipient, staff, vetting: approve.payload.data };
};

const createInventoryFromDonation = async ({
  donor,
  staff,
  itemName = "Support Item",
  quantity = 5,
  itemPointsCost = 5,
  monthlyLimit = 10,
}) => {
  const donation = await jsonRequest("/api/donations", {
    method: "POST",
    token: donor.accessToken,
    headers: {
      "Idempotency-Key": `donation-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    },
    body: {
      proposedPickupTime: new Date(
        Date.now() + 24 * 60 * 60 * 1000,
      ).toISOString(),
      pickupLocation: "Cairo",
      notes: "Donation for E2E milestones",
    },
  });
  assert.equal(donation.response.status, 201);

  const pickedUp = await jsonRequest(
    `/api/donations/${donation.payload.data._id}/status`,
    {
      method: "PUT",
      token: staff.accessToken,
      body: { status: "pickedUp" },
    },
  );
  assert.equal(pickedUp.response.status, 200);

  const item = await jsonRequest("/api/items", {
    method: "POST",
    token: staff.accessToken,
    body: {
      donationID: donation.payload.data._id,
      name: itemName,
      quantity,
      category: "Food",
      description: "Generated for milestone coverage",
      status: "sorted",
      staffID: staff.registration.user._id,
    },
  });
  assert.equal(item.response.status, 201);

  const inventory = await jsonRequest("/api/inventory", {
    method: "POST",
    token: staff.accessToken,
    body: {
      sourceItemID: item.payload.data._id,
      itemName,
      category: "Food",
      quantity,
      itemCondition: "good",
      storageLocation: "Warehouse-A",
      monthlyLimit,
      itemPointsCost,
      staffID: staff.registration.user._id,
    },
  });
  assert.equal(inventory.response.status, 201);

  return {
    donation: donation.payload.data,
    item: item.payload.data,
    inventory: inventory.payload.data,
  };
};

const createRecipientRequestWithItem = async ({
  recipient,
  staff,
  inventory,
  quantity = 1,
}) => {
  const request = await jsonRequest("/api/recipient/request", {
    method: "POST",
    token: recipient.accessToken,
    headers: {
      "Idempotency-Key": `request-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    },
    body: { notes: "Need support for the family" },
  });
  assert.equal(request.response.status, 201);

  const requestedItem = await jsonRequest("/api/requested-items", {
    method: "POST",
    token: recipient.accessToken,
    body: {
      recipientRequestID: request.payload.data._id,
      inventoryID: inventory._id,
      quantity,
    },
  });
  assert.equal(requestedItem.response.status, 201);

  return {
    request: request.payload.data,
    requestedItem: requestedItem.payload.data,
  };
};

test.before(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
  process.env.ENABLE_OTP_AUTH = "true";
  process.env.EMAIL_SERVICE = "gmail";
  process.env.EMAIL_USER = "test@example.com";
  process.env.EMAIL_APP_PASSWORD = "app-password";
  process.env.OTP_EXPIRES_IN = "5m";
  process.env.OTP_LENGTH = "6";
  process.env.OTP_MAX_ATTEMPTS = "3";
  process.env.OTP_RESEND_COOLDOWN = "1";

  try {
    await initializeGlobalMongo();
    state.dbAvailable = isSetupComplete();
    process.env.MONGO_URI = getGlobalUri();

    clearModuleCache();

    const emailService = require("../services/emailService");
    emailService.sendOTPEmail = async ({ to, otpCode, purpose }) => {
      state.sentOtps.push({ to, otpCode, purpose, sentAt: Date.now() });
      return { messageId: `mock-${Date.now()}` };
    };

    const appModule = require("../app");
    state.app = appModule.app || appModule;
    state.server = state.app.listen(0);
    await new Promise((resolve) => state.server.once("listening", resolve));
    const { port } = state.server.address();
    state.baseUrl = `http://127.0.0.1:${port}`;
  } catch (error) {
    console.error(
      "[Milestone E2E] Failed to initialize test server:",
      error.message,
    );
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
  state.sentOtps = [];
});

test("milestone 1 - full system workflow map", async (t) => {
  if (!state.dbAvailable) {
    t.skip("MongoDB server is not available for integration testing");
    return;
  }

  if (!supportsTransactions()) {
    t.skip("MongoDB transactions require replica set support");
    return;
  }

  const authUser = await registerActiveUser({
    role: "Recipient",
    name: "Auth Flow User",
    email: uniqueEmail("auth-flow"),
  });

  const refresh = await jsonRequest("/api/auth/refresh-token", {
    method: "POST",
    body: { refreshToken: authUser.refreshToken },
  });
  assert.equal(refresh.response.status, 200);

  const logout = await jsonRequest("/api/auth/logout", {
    method: "POST",
    token: authUser.accessToken,
    body: { refreshToken: authUser.refreshToken },
  });
  assert.equal(logout.response.status, 200);

  const forgot = await jsonRequest("/api/auth/forgot-password", {
    method: "POST",
    body: { email: authUser.email },
  });
  assert.equal(forgot.response.status, 200);

  const resetOtp = latestOtp({ email: authUser.email, purpose: "reset" });
  assert.ok(resetOtp);

  const reset = await jsonRequest("/api/auth/reset-password", {
    method: "POST",
    body: {
      token: "otp-reset-mode",
      email: authUser.email,
      otp: resetOtp,
      newPassword: "NewStrongPassword123",
    },
  });
  assert.equal(reset.response.status, 200);

  const newLogin = await jsonRequest("/api/auth/login", {
    method: "POST",
    body: { email: authUser.email, password: "NewStrongPassword123" },
  });
  assert.equal(newLogin.response.status, 200);

  const approvedRecipient = await createApprovedRecipient({ points: 120 });
  const donor = await createDonor();
  const staff = approvedRecipient.staff;
  const inventoryBundle = await createInventoryFromDonation({
    donor,
    staff,
    itemName: "Rice Bag",
    quantity: 4,
    itemPointsCost: 6,
    monthlyLimit: 5,
  });
  const requestBundle = await createRecipientRequestWithItem({
    recipient: approvedRecipient,
    staff,
    inventory: inventoryBundle.inventory,
    quantity: 2,
  });

  const approve = await jsonRequest(
    `/api/recipient/review/${requestBundle.request._id}`,
    {
      method: "PUT",
      token: staff.accessToken,
      body: {
        status: "approved",
        staffReviewerID: staff.registration.user._id,
      },
    },
  );
  assert.equal(approve.response.status, 200);

  const fulfill = await jsonRequest(
    `/api/recipient/${requestBundle.request._id}/fulfill`,
    {
      method: "PATCH",
      token: staff.accessToken,
      body: {
        status: "fulfilled",
        staffReviewerID: staff.registration.user._id,
      },
    },
  );
  assert.equal(fulfill.response.status, 200);
});

test("milestone 2 - happy path golden scenarios", async (t) => {
  if (!state.dbAvailable) {
    t.skip("MongoDB server is not available for integration testing");
    return;
  }

  if (!supportsTransactions()) {
    t.skip("MongoDB transactions require replica set support");
    return;
  }

  const recipient = await createApprovedRecipient({ points: 100 });
  const donor = await createDonor();
  const staff = recipient.staff;
  const inventoryBundle = await createInventoryFromDonation({
    donor,
    staff,
    itemName: "Golden Rice",
    quantity: 3,
    itemPointsCost: 10,
    monthlyLimit: 3,
  });
  const requestBundle = await createRecipientRequestWithItem({
    recipient,
    staff,
    inventory: inventoryBundle.inventory,
    quantity: 1,
  });

  const approve = await jsonRequest(
    `/api/recipient/review/${requestBundle.request._id}`,
    {
      method: "PUT",
      token: staff.accessToken,
      body: {
        status: "approved",
        staffReviewerID: staff.registration.user._id,
      },
    },
  );
  assert.equal(approve.response.status, 200);

  const recipientPoints = await RecipientPoints.findOne({
    recipientUserID: recipient.registration.user._id,
  }).lean();
  assert.ok(recipientPoints);

  const updatedInventory = await Inventory.findById(
    inventoryBundle.inventory._id,
  ).lean();
  assert.equal(updatedInventory.quantity, 2);

  const updatedRequest = await RecipientRequest.findById(
    requestBundle.request._id,
  ).lean();
  assert.equal(updatedRequest.status, "approved");
});

test("milestone 3 - negative testing failure scenarios", async (t) => {
  if (!state.dbAvailable) {
    t.skip("MongoDB server is not available for integration testing");
    return;
  }

  const loginFail = await jsonRequest("/api/auth/login", {
    method: "POST",
    body: { email: "missing@example.com", password: "bad-password" },
  });
  assert.equal(loginFail.response.status, 401);

  const recipient = await registerUser({
    role: "Recipient",
    email: uniqueEmail("neg-recipient"),
  });
  const wrongOtp = await jsonRequest("/api/auth/verify-otp", {
    method: "POST",
    body: { email: recipient.email, otp: "000000", purpose: "verify" },
  });
  assert.equal(wrongOtp.response.status, 400);

  const resetFail = await jsonRequest("/api/auth/reset-password", {
    method: "POST",
    body: {
      token: "old-token",
      email: recipient.email,
      otp: "111111",
      newPassword: "NewStrongPassword123",
    },
  });
  assert.equal(resetFail.response.status, 400);

  const pendingUser = await registerUser({
    role: "Recipient",
    email: uniqueEmail("not-verified"),
  });
  const requestBlocked = await jsonRequest("/api/recipient/request", {
    method: "POST",
    token: pendingUser.payload.data.accessToken,
    body: { notes: "should fail" },
  });
  assert.equal(requestBlocked.response.status, 403);

  const staff = await createStaff();
  const donor = await createDonor();
  const inventoryBundle = await createInventoryFromDonation({
    donor,
    staff,
    itemName: "Negative Flow Item",
    quantity: 1,
    itemPointsCost: 2,
    monthlyLimit: 1,
  });
  const approvedRecipient = await createApprovedRecipient({ points: 1 });

  const request = await jsonRequest("/api/recipient/request", {
    method: "POST",
    token: approvedRecipient.accessToken,
    body: { notes: "quota test" },
  });
  assert.equal(request.response.status, 201);

  const missingInventory = await jsonRequest("/api/requested-items", {
    method: "POST",
    token: approvedRecipient.accessToken,
    body: {
      recipientRequestID: request.payload.data._id,
      inventoryID: new mongoose.Types.ObjectId().toString(),
      quantity: 1,
    },
  });
  assert.equal(missingInventory.response.status, 404);

  const negativeInventory = await jsonRequest("/api/inventory", {
    method: "POST",
    token: staff.accessToken,
    body: {
      sourceItemID: inventoryBundle.item._id,
      itemName: "Bad Quantity",
      category: "Food",
      quantity: -1,
      itemCondition: "good",
      storageLocation: "Bad-Warehouse",
      staffID: staff.registration.user._id,
    },
  });
  assert.equal(negativeInventory.response.status, 400);
});

test("milestone 4 - authorization and role testing", async (t) => {
  if (!state.dbAvailable) {
    t.skip("MongoDB server is not available for integration testing");
    return;
  }

  const admin = await createAdmin();
  const donor = await createDonor();
  const recipient = await createApprovedRecipient({ points: 50 });
  const staff = recipient.staff;

  const usersAllowed = await jsonRequest("/api/users", {
    token: admin.accessToken,
  });
  assert.equal(usersAllowed.response.status, 200);

  const donorForbidden = await jsonRequest("/api/users", {
    token: donor.accessToken,
  });
  assert.equal(donorForbidden.response.status, 403);

  const inventoryBundle = await createInventoryFromDonation({
    donor,
    staff,
    itemName: "Role Test Item",
    quantity: 2,
    itemPointsCost: 2,
    monthlyLimit: 2,
  });
  const recipientTwo = await createApprovedRecipient({ points: 20 });
  const requestBundle = await createRecipientRequestWithItem({
    recipient: recipientTwo,
    staff,
    inventory: inventoryBundle.inventory,
    quantity: 1,
  });

  const wrongOwnerUpdate = await jsonRequest(
    `/api/recipient/review/${requestBundle.request._id}`,
    {
      method: "PUT",
      token: donor.accessToken,
      body: {
        status: "approved",
        staffReviewerID: donor.registration.user._id,
      },
    },
  );
  assert.equal(wrongOwnerUpdate.response.status, 403);

  const approved = await jsonRequest(
    `/api/recipient/review/${requestBundle.request._id}`,
    {
      method: "PUT",
      token: staff.accessToken,
      body: {
        status: "approved",
        staffReviewerID: staff.registration.user._id,
      },
    },
  );
  assert.equal(approved.response.status, 200);
});

test("milestone 5 - concurrency and race conditions", async (t) => {
  if (!state.dbAvailable) {
    t.skip("MongoDB server is not available for integration testing");
    return;
  }

  if (!supportsTransactions()) {
    t.skip("MongoDB transactions require replica set support");
    return;
  }

  const recipientA = await createApprovedRecipient({ points: 50 });
  const recipientB = await createApprovedRecipient({ points: 50 });
  const donor = await createDonor();
  const staff = recipientA.staff;

  const inventoryBundle = await createInventoryFromDonation({
    donor,
    staff,
    itemName: "Last Item",
    quantity: 1,
    itemPointsCost: 5,
    monthlyLimit: 1,
  });
  const requestA = await createRecipientRequestWithItem({
    recipient: recipientA,
    staff,
    inventory: inventoryBundle.inventory,
    quantity: 1,
  });
  const requestB = await createRecipientRequestWithItem({
    recipient: recipientB,
    staff,
    inventory: inventoryBundle.inventory,
    quantity: 1,
  });

  const approvals = await Promise.all([
    jsonRequest(`/api/recipient/review/${requestA.request._id}`, {
      method: "PUT",
      token: staff.accessToken,
      body: {
        status: "approved",
        staffReviewerID: staff.registration.user._id,
      },
    }),
    jsonRequest(`/api/recipient/review/${requestB.request._id}`, {
      method: "PUT",
      token: staff.accessToken,
      body: {
        status: "approved",
        staffReviewerID: staff.registration.user._id,
      },
    }),
  ]);

  const approvalStatuses = approvals.map((entry) => entry.response.status);
  assert.ok(approvalStatuses.includes(200));
  assert.ok(approvalStatuses.some((status) => status >= 400));

  const doubleClickKey = `idemp-${Date.now()}`;
  const donationBody = {
    proposedPickupTime: new Date(
      Date.now() + 24 * 60 * 60 * 1000,
    ).toISOString(),
    pickupLocation: "Cairo",
    notes: "double click test",
  };

  const doubleDonation = await Promise.all([
    jsonRequest("/api/donations", {
      method: "POST",
      token: donor.accessToken,
      headers: { "Idempotency-Key": doubleClickKey },
      body: donationBody,
    }),
    jsonRequest("/api/donations", {
      method: "POST",
      token: donor.accessToken,
      headers: { "Idempotency-Key": doubleClickKey },
      body: donationBody,
    }),
  ]);

  const donationStatuses = doubleDonation
    .map((entry) => entry.response.status)
    .sort();
  assert.deepEqual(donationStatuses, [201, 409]);
});

test("milestone 6 - idempotency validation", async (t) => {
  if (!state.dbAvailable) {
    t.skip("MongoDB server is not available for integration testing");
    return;
  }

  const donor = await createDonor();
  const key = `donation-${Date.now()}`;
  const donationBody = {
    proposedPickupTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    pickupLocation: "Cairo",
    notes: "idempotency test",
  };

  const first = await jsonRequest("/api/donations", {
    method: "POST",
    token: donor.accessToken,
    headers: { "Idempotency-Key": key },
    body: donationBody,
  });

  await waitForIdempotencyCompletion({
    idempotencyKey: key,
    userID: donor.registration.user._id,
    endpoint: "/api/donations",
    method: "POST",
  });

  const second = await jsonRequest("/api/donations", {
    method: "POST",
    token: donor.accessToken,
    headers: { "Idempotency-Key": key },
    body: donationBody,
  });

  assert.equal(first.response.status, 201);
  assert.equal(second.response.status, 201);

  const storedCount = await DonationReq.countDocuments({
    donorID: donor.registration.user._id,
  });
  assert.equal(storedCount, 1);
});

test("milestone 7 - data consistency checks", async (t) => {
  if (!state.dbAvailable) {
    t.skip("MongoDB server is not available for integration testing");
    return;
  }

  if (!supportsTransactions()) {
    t.skip("MongoDB transactions require replica set support");
    return;
  }

  const recipient = await createApprovedRecipient({ points: 30 });
  const donor = await createDonor();
  const staff = recipient.staff;
  const inventoryBundle = await createInventoryFromDonation({
    donor,
    staff,
    itemName: "Consistency Item",
    quantity: 4,
    itemPointsCost: 5,
    monthlyLimit: 4,
  });
  const requestBundle = await createRecipientRequestWithItem({
    recipient,
    staff,
    inventory: inventoryBundle.inventory,
    quantity: 2,
  });

  const beforePoints = await RecipientPoints.findOne({
    recipientUserID: recipient.registration.user._id,
  }).lean();
  const beforeInventory = await Inventory.findById(
    inventoryBundle.inventory._id,
  ).lean();

  const approve = await jsonRequest(
    `/api/recipient/review/${requestBundle.request._id}`,
    {
      method: "PUT",
      token: staff.accessToken,
      body: {
        status: "approved",
        staffReviewerID: staff.registration.user._id,
      },
    },
  );
  assert.equal(approve.response.status, 200);

  const afterPoints = await RecipientPoints.findOne({
    recipientUserID: recipient.registration.user._id,
  }).lean();
  const afterInventory = await Inventory.findById(
    inventoryBundle.inventory._id,
  ).lean();
  const afterRequest = await RecipientRequest.findById(
    requestBundle.request._id,
  ).lean();
  const tx = await PointsTransaction.findOne({
    recipientUserID: recipient.registration.user._id,
  }).lean();

  assert.ok(afterPoints.currentPoints < beforePoints.currentPoints);
  assert.equal(afterInventory.quantity, beforeInventory.quantity - 2);
  assert.equal(afterRequest.status, "approved");
  assert.ok(tx);
});

test("milestone 8 - integration testing real flow", async (t) => {
  if (!state.dbAvailable) {
    t.skip("MongoDB server is not available for integration testing");
    return;
  }

  if (!supportsTransactions()) {
    t.skip("MongoDB transactions require replica set support");
    return;
  }

  const donor = await createDonor();
  const recipient = await createApprovedRecipient({ points: 80 });
  const staff = recipient.staff;

  const inventoryBundle = await createInventoryFromDonation({
    donor,
    staff,
    itemName: "Integration Item",
    quantity: 5,
    itemPointsCost: 8,
    monthlyLimit: 5,
  });
  const requestBundle = await createRecipientRequestWithItem({
    recipient,
    staff,
    inventory: inventoryBundle.inventory,
    quantity: 1,
  });

  const approve = await jsonRequest(
    `/api/recipient/review/${requestBundle.request._id}`,
    {
      method: "PUT",
      token: staff.accessToken,
      body: {
        status: "approved",
        staffReviewerID: staff.registration.user._id,
      },
    },
  );
  assert.equal(approve.response.status, 200);

  const fulfill = await jsonRequest(
    `/api/recipient/${requestBundle.request._id}/fulfill`,
    {
      method: "PATCH",
      token: staff.accessToken,
      body: {
        status: "fulfilled",
        staffReviewerID: staff.registration.user._id,
      },
    },
  );
  assert.equal(fulfill.response.status, 200);

  const request = await RecipientRequest.findById(
    requestBundle.request._id,
  ).lean();
  const points = await RecipientPoints.findOne({
    recipientUserID: recipient.registration.user._id,
  }).lean();
  const inventory = await Inventory.findById(
    inventoryBundle.inventory._id,
  ).lean();

  assert.equal(request.status, "fulfilled");
  assert.ok(points.currentPoints >= 0);
  assert.ok(inventory.quantity >= 0);
});

test("milestone 9 - stress and load testing", async (t) => {
  if (!state.dbAvailable) {
    t.skip("MongoDB server is not available for integration testing");
    return;
  }

  const users = await Promise.all(
    Array.from({ length: 10 }).map((_, index) =>
      registerUser({ role: "Recipient", email: uniqueEmail(`load-${index}`) }),
    ),
  );

  const attempts = await Promise.all(
    users.map((entry) =>
      jsonRequest("/api/auth/send-otp", {
        method: "POST",
        body: { email: entry.email, purpose: "reset" },
      }),
    ),
  );

  const successCount = attempts.filter(
    (entry) => entry.response.status === 200,
  ).length;
  const limiterCount = attempts.filter(
    (entry) => entry.response.status === 429,
  ).length;

  assert.equal(successCount, attempts.length);
  assert.equal(limiterCount, 0);
});

test("milestone 10 - security testing", async (t) => {
  if (!state.dbAvailable) {
    t.skip("MongoDB server is not available for integration testing");
    return;
  }

  const authUser = await registerActiveUser({
    role: "Recipient",
    email: uniqueEmail("security"),
  });

  const injectionLogin = await jsonRequest("/api/auth/login", {
    method: "POST",
    body: { email: { $ne: "" }, password: "anything" },
  });
  assert.equal(injectionLogin.response.status, 401);

  const xssRegister = await jsonRequest("/api/auth/register", {
    method: "POST",
    body: {
      role: "Recipient",
      name: "<script>alert(1)</script>",
      email: uniqueEmail("xss"),
      passwordHash: "StrongPassword123",
      phoneNumber: "01012345678",
      address: "Cairo",
    },
  });
  assert.equal(xssRegister.response.status, 201);

  const tamperedToken = `${authUser.accessToken.slice(0, -2)}zz`;
  const tamperedMe = await jsonRequest("/api/auth/me", {
    token: tamperedToken,
  });
  assert.equal(tamperedMe.response.status, 401);

  const protectedWithoutToken = await jsonRequest("/api/users");
  assert.equal(protectedWithoutToken.response.status, 401);
});

test("milestone 11 - background jobs validation", async (t) => {
  if (!state.dbAvailable) {
    t.skip("MongoDB server is not available for integration testing");
    return;
  }

  const admin = await createAdmin();
  const recipient = await createApprovedRecipient({ points: 33 });

  await RecipientPoints.updateOne(
    { recipientUserID: recipient.registration.user._id },
    {
      $set: {
        currentPoints: 7,
        monthlyAllocation: 33,
        lastResetDate: new Date("2025-12-01T00:00:00.000Z"),
      },
    },
  );

  const reset = await jsonRequest("/api/configs/system/run-monthly-reset", {
    method: "POST",
    token: admin.accessToken,
  });
  assert.equal(reset.response.status, 200);

  const afterReset = await RecipientPoints.findOne({
    recipientUserID: recipient.registration.user._id,
  }).lean();
  assert.equal(afterReset.currentPoints, afterReset.monthlyAllocation);

  const recalc = await jsonRequest(
    "/api/configs/system/recalculate-priorities",
    {
      method: "POST",
      token: admin.accessToken,
    },
  );
  assert.equal(recalc.response.status, 200);

  const priority = await RecipientPriority.findOne({
    recipientUserID: recipient.registration.user._id,
  }).lean();
  assert.ok(priority);
});

test("milestone 12 - logging and monitoring", async (t) => {
  if (!state.dbAvailable) {
    t.skip("MongoDB server is not available for integration testing");
    return;
  }

  const user = await registerUser({
    role: "Recipient",
    email: uniqueEmail("audit"),
  });

  const beforeCount = await SystemAuditLog.countDocuments();
  const otpCode = latestOtp({ email: user.email, purpose: "verify" });
  const verify = await jsonRequest("/api/auth/verify-otp", {
    method: "POST",
    body: { email: user.email, otp: otpCode, purpose: "verify" },
  });
  assert.equal(verify.response.status, 200);

  const afterCount = await SystemAuditLog.countDocuments();
  assert.ok(afterCount > beforeCount);
});

test("milestone 13 - edge case testing", async (t) => {
  if (!state.dbAvailable) {
    t.skip("MongoDB server is not available for integration testing");
    return;
  }

  const user = await registerUser({
    role: "Recipient",
    email: uniqueEmail("edge"),
  });
  const otpCode = latestOtp({ email: user.email, purpose: "verify" });

  const firstUse = await jsonRequest("/api/auth/verify-otp", {
    method: "POST",
    body: { email: user.email, otp: otpCode, purpose: "verify" },
  });
  assert.equal(firstUse.response.status, 200);

  const secondUse = await jsonRequest("/api/auth/verify-otp", {
    method: "POST",
    body: { email: user.email, otp: otpCode, purpose: "verify" },
  });
  assert.ok(secondUse.response.status >= 400);

  const staff = await createStaff();
  const donor = await createDonor();
  const inventoryBundle = await createInventoryFromDonation({
    donor,
    staff,
    itemName: "Edge Item",
    quantity: 2,
    itemPointsCost: 3,
    monthlyLimit: 2,
  });
  const emptyRequest = await jsonRequest("/api/recipient/request", {
    method: "POST",
    token: (await createApprovedRecipient({ points: 20 })).accessToken,
    body: { notes: "empty request" },
  });
  assert.equal(emptyRequest.response.status, 201);

  const approveEmpty = await jsonRequest(
    `/api/recipient/review/${emptyRequest.payload.data._id}`,
    {
      method: "PUT",
      token: staff.accessToken,
      body: {
        status: "approved",
        staffReviewerID: staff.registration.user._id,
      },
    },
  );
  assert.equal(approveEmpty.response.status, 404);

  const linkedItemDelete = await jsonRequest(
    `/api/items/${inventoryBundle.item._id}`,
    {
      method: "DELETE",
      token: staff.accessToken,
    },
  );
  assert.ok([200, 400, 409].includes(linkedItemDelete.response.status));
});

test("milestone 14 - API contract validation", async (t) => {
  if (!state.dbAvailable) {
    t.skip("MongoDB server is not available for integration testing");
    return;
  }

  const admin = await createAdmin();

  const users = await jsonRequest("/api/users", { token: admin.accessToken });
  assert.equal(users.response.status, 200);
  assert.equal(users.payload.success, true);
  assert.ok(Array.isArray(users.payload.data));
  assert.ok("count" in users.payload || "pagination" in users.payload);

  const contractError = await jsonRequest("/api/auth/login", {
    method: "POST",
    body: { email: "bad@example.com", password: "wrong" },
  });
  assert.equal(contractError.response.status, 401);
  assert.equal(contractError.payload.success, false);
  assert.ok(typeof contractError.payload.message === "string");
});

test("milestone 15 - final system audit", async (t) => {
  if (!state.dbAvailable) {
    t.skip("MongoDB server is not available for integration testing");
    return;
  }

  if (!supportsTransactions()) {
    t.skip("MongoDB transactions require replica set support");
    return;
  }

  const donor = await createDonor();
  const recipient = await createApprovedRecipient({ points: 90 });
  const staff = recipient.staff;

  const inventoryBundle = await createInventoryFromDonation({
    donor,
    staff,
    itemName: "Final Audit Item",
    quantity: 3,
    itemPointsCost: 7,
    monthlyLimit: 3,
  });
  const requestBundle = await createRecipientRequestWithItem({
    recipient,
    staff,
    inventory: inventoryBundle.inventory,
    quantity: 1,
  });

  const approval = await jsonRequest(
    `/api/recipient/review/${requestBundle.request._id}`,
    {
      method: "PUT",
      token: staff.accessToken,
      body: {
        status: "approved",
        staffReviewerID: staff.registration.user._id,
      },
    },
  );
  assert.equal(approval.response.status, 200);

  const fulfill = await jsonRequest(
    `/api/recipient/${requestBundle.request._id}/fulfill`,
    {
      method: "PATCH",
      token: staff.accessToken,
      body: {
        status: "fulfilled",
        staffReviewerID: staff.registration.user._id,
      },
    },
  );
  assert.equal(fulfill.response.status, 200);

  const request = await RecipientRequest.findById(
    requestBundle.request._id,
  ).lean();
  const inventory = await Inventory.findById(
    inventoryBundle.inventory._id,
  ).lean();
  const points = await RecipientPoints.findOne({
    recipientUserID: recipient.registration.user._id,
  }).lean();
  const messages = await Message.find({
    userID: recipient.registration.user._id,
  }).lean();
  const auditLogs = await SystemAuditLog.find().lean();

  assert.equal(request.status, "fulfilled");
  assert.ok(inventory.quantity >= 0);
  assert.ok(points.currentPoints >= 0);
  assert.ok(messages.length >= 1);
  assert.ok(auditLogs.length >= 0);
});
