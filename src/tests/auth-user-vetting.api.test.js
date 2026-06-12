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

const User = require("../models/userModel");
const RecipientPoints = require("../models/recipientPointsModel");
const RecipientPriority = require("../models/recipientPriorityModel");
const VettingRequest = require("../models/vettingRequestModel");

const state = {
  dbAvailable: false,
  app: null,
  server: null,
  baseUrl: null,
};

const clearModuleCache = () => {
  const modulesToReset = [
    "../config/appConfig",
    "../services/emailService",
    "../services/otpService",
    "../services/authService",
    "../controllers/authController",
    "../routes/authRoutes",
    "../app",
  ];

  for (const relativePath of modulesToReset) {
    const absolutePath = require.resolve(relativePath, { paths: [__dirname] });
    delete require.cache[absolutePath];
  }
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

  const registration = await jsonRequest("/api/auth/register", {
    method: "POST",
    body: payload,
  });
  if (
    registration.response.status === 201 &&
    registration.payload?.data?.user?._id
  ) {
    await User.findByIdAndUpdate(registration.payload.data.user._id, {
      accountStatus: "active",
    });
  }

  return registration;
};

const loginUser = async (email, password) => {
  return jsonRequest("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
};

test.before(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
  process.env.ENABLE_OTP_AUTH = "true";
  process.env.EMAIL_SERVICE = "gmail";
  process.env.EMAIL_USER = "test@example.com";
  process.env.EMAIL_APP_PASSWORD = "app-password";

  try {
    await initializeGlobalMongo();
    state.dbAvailable = isSetupComplete();
    process.env.MONGO_URI = getGlobalUri();

    clearModuleCache();

    const emailService = require("../services/emailService");
    emailService.sendOTPEmail = async ({ to, otpCode, purpose }) => {
      return { messageId: `mock-${to}-${purpose}-${otpCode}` };
    };

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

test("auth register success and validation/business cases", async (t) => {
  if (!state.dbAvailable) {
    t.skip("MongoDB server is not available for integration testing");
    return;
  }

  const success = await registerUser();
  assert.equal(success.response.status, 201);
  assert.equal(success.payload.success, true);
  assert.ok(success.payload.data.accessToken);

  const stored = await User.findOne({
    email: success.payload.data.user.email,
  }).lean();
  assert.ok(stored);

  const missingEmail = await jsonRequest("/api/auth/register", {
    method: "POST",
    body: {
      role: "Recipient",
      name: "Missing Email",
      passwordHash: "StrongPassword123",
      phoneNumber: "01012345678",
      address: "Cairo",
    },
  });
  assert.equal(missingEmail.response.status, 400);

  const shortPassword = await jsonRequest("/api/auth/register", {
    method: "POST",
    body: {
      role: "Recipient",
      name: "Short Password",
      email: `short-${Date.now()}@example.com`,
      passwordHash: "123",
      phoneNumber: "01012345678",
      address: "Cairo",
    },
  });
  assert.equal(shortPassword.response.status, 400);

  const wrongRole = await jsonRequest("/api/auth/register", {
    method: "POST",
    body: {
      role: "Visitor",
      name: "Wrong Role",
      email: `role-${Date.now()}@example.com`,
      passwordHash: "StrongPassword123",
      phoneNumber: "01012345678",
      address: "Cairo",
    },
  });
  assert.equal(wrongRole.response.status, 400);

  const duplicate = await jsonRequest("/api/auth/register", {
    method: "POST",
    body: {
      role: "Recipient",
      name: "Dup User",
      email: success.payload.data.user.email,
      passwordHash: "StrongPassword123",
      phoneNumber: "01012345678",
      address: "Cairo",
    },
  });
  assert.equal(duplicate.response.status, 409);
});

test("auth login and me cases", async (t) => {
  if (!state.dbAvailable) {
    t.skip("MongoDB server is not available for integration testing");
    return;
  }

  const registration = await registerUser({
    email: "login@example.com",
    passwordHash: "StrongPassword123",
  });
  assert.equal(registration.response.status, 201);

  const loginSuccess = await loginUser(
    "login@example.com",
    "StrongPassword123",
  );
  assert.equal(loginSuccess.response.status, 200);
  assert.ok(loginSuccess.payload.data.accessToken);

  const wrongEmail = await loginUser("wrong@example.com", "StrongPassword123");
  assert.equal(wrongEmail.response.status, 401);

  const wrongPassword = await loginUser(
    "login@example.com",
    "WrongPassword123",
  );
  assert.equal(wrongPassword.response.status, 401);

  const meSuccess = await jsonRequest("/api/auth/me", {
    token: loginSuccess.payload.data.accessToken,
  });
  assert.equal(meSuccess.response.status, 200);
  assert.equal(meSuccess.payload.data.email, "login@example.com");

  const meNoToken = await jsonRequest("/api/auth/me");
  assert.equal(meNoToken.response.status, 401);

  const meInvalidToken = await jsonRequest("/api/auth/me", {
    token: "invalid-token",
  });
  assert.equal(meInvalidToken.response.status, 401);
});

test("user list auth and role cases plus self update", async (t) => {
  if (!state.dbAvailable) {
    t.skip("MongoDB server is not available for integration testing");
    return;
  }

  const adminRegistration = await registerUser({
    role: "Admin",
    email: "admin@example.com",
    passwordHash: "StrongPassword123",
  });
  const adminToken = adminRegistration.payload.data.accessToken;

  const recipientRegistration = await registerUser({
    role: "Recipient",
    email: "recipient@example.com",
    passwordHash: "StrongPassword123",
  });
  const recipientToken = recipientRegistration.payload.data.accessToken;
  const recipientId = recipientRegistration.payload.data.user._id;

  const listSuccess = await jsonRequest("/api/users", { token: adminToken });
  assert.equal(listSuccess.response.status, 200);
  assert.ok(Array.isArray(listSuccess.payload.data));

  const listNoToken = await jsonRequest("/api/users");
  assert.equal(listNoToken.response.status, 401);

  const listForbidden = await jsonRequest("/api/users", {
    token: recipientToken,
  });
  assert.equal(listForbidden.response.status, 403);

  const updateSuccess = await jsonRequest(`/api/users/${recipientId}`, {
    method: "PUT",
    token: recipientToken,
    body: {
      role: "Recipient",
      name: "Updated Recipient",
      email: "recipient@example.com",
      passwordHash: "StrongPassword123",
      phoneNumber: "01012345678",
      address: "Alexandria",
    },
  });
  assert.equal(updateSuccess.response.status, 200);
  assert.equal(updateSuccess.payload.data.name, "Updated Recipient");

  const updatedInDb = await User.findById(recipientId).lean();
  assert.equal(updatedInDb.address, "Alexandria");

  const badId = await jsonRequest("/api/users/not-an-id", {
    method: "PUT",
    token: adminToken,
    body: {
      role: "Recipient",
      name: "Bad Id",
      email: "recipient@example.com",
      passwordHash: "StrongPassword123",
      phoneNumber: "01012345678",
      address: "Alexandria",
    },
  });
  assert.equal(badId.response.status, 400);

  const otherUserRegistration = await registerUser({
    role: "Staff",
    email: "other@example.com",
    passwordHash: "StrongPassword123",
  });
  const otherUserId = otherUserRegistration.payload.data.user._id;

  const editOther = await jsonRequest(`/api/users/${otherUserId}`, {
    method: "PUT",
    token: recipientToken,
    body: {
      role: "Staff",
      name: "Hacker",
      email: "other@example.com",
      passwordHash: "StrongPassword123",
      phoneNumber: "01012345678",
      address: "Cairo",
    },
  });
  assert.equal(editOther.response.status, 403);
});

test("vetting request approve and reject cases", async (t) => {
  if (!state.dbAvailable) {
    t.skip("MongoDB server is not available for integration testing");
    return;
  }

  if (!supportsTransactions()) {
    t.skip("MongoDB transactions require replica set support");
    return;
  }

  const recipientRegistration = await registerUser({
    role: "Recipient",
    email: "vet-recipient@example.com",
    passwordHash: "StrongPassword123",
  });
  const recipientToken = recipientRegistration.payload.data.accessToken;
  const recipientId = recipientRegistration.payload.data.user._id;

  const donorRegistration = await registerUser({
    role: "Donor",
    email: "vet-donor@example.com",
    passwordHash: "StrongPassword123",
  });
  const donorToken = donorRegistration.payload.data.accessToken;

  const staffRegistration = await registerUser({
    role: "Staff",
    email: "vet-staff@example.com",
    passwordHash: "StrongPassword123",
  });
  const staffToken = staffRegistration.payload.data.accessToken;

  const validationRecipientRegistration = await registerUser({
    role: "Recipient",
    email: "vet-validation@example.com",
    passwordHash: "StrongPassword123",
  });
  const validationRecipientToken =
    validationRecipientRegistration.payload.data.accessToken;

  const requestSuccess = await jsonRequest("/api/vetting/request", {
    method: "POST",
    token: recipientToken,
    body: {
      nationalID: "12345678901234",
      jobTitle: "Teacher",
      monthlyIncome: 1200,
      familyMembers: 4,
      healthStatus: "medium",
      documentsURL: ["https://example.com/evidence.pdf"],
    },
  });
  assert.equal(requestSuccess.response.status, 201);
  assert.equal(requestSuccess.payload.success, true);

  const storedRequest = await VettingRequest.findOne({
    recipientUserID: recipientId,
  }).lean();
  assert.ok(storedRequest);

  const missingIncome = await jsonRequest("/api/vetting/request", {
    method: "POST",
    token: validationRecipientToken,
    body: {
      nationalID: "12345678901234",
      jobTitle: "Teacher",
      familyMembers: 4,
      healthStatus: "medium",
      documentsURL: ["https://example.com/evidence.pdf"],
    },
  });
  assert.equal(missingIncome.response.status, 400);

  const invalidHealth = await jsonRequest("/api/vetting/request", {
    method: "POST",
    token: validationRecipientToken,
    body: {
      nationalID: "12345678901234",
      jobTitle: "Teacher",
      monthlyIncome: 1200,
      familyMembers: 4,
      healthStatus: "invalid-status",
      documentsURL: ["https://example.com/evidence.pdf"],
    },
  });
  assert.equal(invalidHealth.response.status, 400);

  const wrongRole = await jsonRequest("/api/vetting/request", {
    method: "POST",
    token: donorToken,
    body: {
      nationalID: "12345678901235",
      jobTitle: "Worker",
      monthlyIncome: 800,
      familyMembers: 2,
      healthStatus: "healthy",
      documentsURL: ["https://example.com/evidence.pdf"],
    },
  });
  assert.equal(wrongRole.response.status, 403);

  const duplicateRequest = await jsonRequest("/api/vetting/request", {
    method: "POST",
    token: recipientToken,
    body: {
      nationalID: "12345678901234",
      jobTitle: "Teacher",
      monthlyIncome: 1200,
      familyMembers: 4,
      healthStatus: "medium",
      documentsURL: ["https://example.com/evidence.pdf"],
    },
  });
  assert.equal(duplicateRequest.response.status, 409);

  const approveSuccess = await jsonRequest(
    `/api/vetting/approve/${storedRequest._id}`,
    {
      method: "PUT",
      token: staffToken,
    },
  );
  assert.equal(approveSuccess.response.status, 200);
  assert.equal(approveSuccess.payload.data.vettingStatus, "approved");

  const updatedRecipient = await User.findById(recipientId).lean();
  assert.equal(updatedRecipient.vettingStatus, "approved");

  const points = await RecipientPoints.findOne({
    recipientUserID: recipientId,
  }).lean();
  assert.ok(points);

  const priority = await RecipientPriority.findOne({
    recipientUserID: recipientId,
  }).lean();
  assert.ok(priority);

  const approveTwice = await jsonRequest(
    `/api/vetting/approve/${storedRequest._id}`,
    {
      method: "PUT",
      token: staffToken,
    },
  );
  assert.equal(approveTwice.response.status, 409);

  const rejectRequest = await jsonRequest("/api/vetting/request", {
    method: "POST",
    token: validationRecipientToken,
    body: {
      nationalID: "12345678901236",
      jobTitle: "Teacher",
      monthlyIncome: 1400,
      familyMembers: 3,
      healthStatus: "temporary",
      documentsURL: ["https://example.com/evidence-2.pdf"],
    },
  });
  assert.equal(rejectRequest.response.status, 201);

  const rejectSuccess = await jsonRequest(
    `/api/vetting/reject/${rejectRequest.payload.data._id}`,
    {
      method: "PUT",
      token: staffToken,
      body: { notes: "Missing supporting evidence" },
    },
  );
  assert.equal(rejectSuccess.response.status, 200);
  assert.equal(rejectSuccess.payload.data.vettingStatus, "rejected");

  const nonStaffApprove = await jsonRequest(
    `/api/vetting/approve/${rejectRequest.payload.data._id}`,
    {
      method: "PUT",
      token: recipientToken,
    },
  );
  assert.equal(nonStaffApprove.response.status, 403);
});
