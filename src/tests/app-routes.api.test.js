const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  initializeGlobalMongo,
  cleanupGlobalMongo,
  getGlobalUri,
  isSetupComplete,
} = require("./globalSetup");
const { resetIntegrationMongo } = require("./integrationMongoSetup");

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
    role: "Admin",
    name: "Test Admin",
    email: `status-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
    passwordHash: "StrongPassword123",
    phoneNumber: "01012345678",
    address: "Cairo",
    ...overrides,
  };

  return jsonRequest("/api/auth/register", { method: "POST", body: payload });
};

before(async () => {
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

describe("Route /", () => {
  it("should succeed - GET / returns service metadata", async (t) => {
    if (!state.dbAvailable) {
      t.skip("MongoDB not available");
      return;
    }

    const res = await jsonRequest("/");

    assert.equal(res.response.status, 200);
    assert.equal(res.payload.success, true);
    assert.equal(res.payload.data.service, "Charity System API");
  });
});

describe("Route /health", () => {
  it("should succeed - GET /health returns operational snapshot", async (t) => {
    if (!state.dbAvailable) {
      t.skip("MongoDB not available");
      return;
    }

    const res = await jsonRequest("/health");

    assert.equal(res.response.status, 200);
    assert.equal(res.payload.success, true);
    assert.equal(res.payload.message, "healthy");
    assert.equal(res.payload.data.serverStatus, "running");
    assert.ok("dbStatus" in res.payload.data);
    assert.ok("uptime" in res.payload.data);
  });
});

describe("Route /status", () => {
  it("should succeed - GET /status returns protected system snapshot", async (t) => {
    if (!state.dbAvailable) {
      t.skip("MongoDB not available");
      return;
    }

    const admin = await registerUser({
      role: "Admin",
      email: "status-admin@example.com",
    });
    const adminToken = admin.payload.data.accessToken;

    const res = await jsonRequest("/status", { token: adminToken });

    assert.equal(res.response.status, 200);
    assert.equal(res.payload.success, true);
    assert.equal(res.payload.message, "system status");
    assert.equal(res.payload.data.nodeEnv, "test");
    assert.ok(Array.isArray(res.payload.data.activeJobs));
  });
});
