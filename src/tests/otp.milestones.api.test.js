const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { initializeGlobalMongo, cleanupGlobalMongo, getGlobalUri, isSetupComplete } = require('./globalSetup');
const { resetIntegrationMongo } = require('./integrationMongoSetup');

const User = require('../models/userModel');
const Otp = require('../models/otpModel');

const state = {
  dbAvailable: false,
  app: null,
  server: null,
  baseUrl: null,
  otpService: null,
  sentOtps: [],
  failEmails: new Set(),
};

const clearModuleCache = () => {
  const pathsToReset = [
    '../config/appConfig',
    '../services/emailService',
    '../services/otpService',
    '../services/authService',
    '../controllers/authController',
    '../routes/authRoutes',
    '../middlewares/rateLimiterMW',
    '../app',
  ];

  for (const relativePath of pathsToReset) {
    const absolutePath = require.resolve(relativePath, { paths: [__dirname] });
    delete require.cache[absolutePath];
  }
};

const loadTestAppWithOtpEnabled = () => {
  process.env.NODE_ENV = 'test';
  process.env.ENABLE_OTP_AUTH = 'true';
  process.env.EMAIL_SERVICE = 'gmail';
  process.env.EMAIL_USER = 'test@example.com';
  process.env.EMAIL_APP_PASSWORD = 'app-password';
  process.env.OTP_EXPIRES_IN = '5m';
  process.env.OTP_LENGTH = '6';
  process.env.OTP_MAX_ATTEMPTS = '3';
  process.env.OTP_RESEND_COOLDOWN = '1';

  clearModuleCache();

  const emailService = require('../services/emailService');
  emailService.sendOTPEmail = async ({ to, otpCode, purpose }) => {
    if (state.failEmails.has(to)) {
      state.failEmails.delete(to);
      throw new Error('Simulated Gmail failure');
    }

    state.sentOtps.push({ to, otpCode, purpose, sentAt: Date.now() });
    return { messageId: `mock-${Date.now()}` };
  };

  state.otpService = require('../services/otpService');

  const appModule = require('../app');
  state.app = appModule.app || appModule;
};

const jsonRequest = async (path, { method = 'GET', body = undefined, token = null } = {}) => {
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

const uniqueEmail = (prefix = 'otp') => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;

const createUser = async (overrides = {}) => {
  const payload = {
    role: 'Recipient',
    name: 'OTP API User',
    email: uniqueEmail('user'),
    passwordHash: 'StrongPassword123',
    phoneNumber: '01012345678',
    address: 'Cairo',
    accountStatus: 'suspended',
    vettingStatus: 'approved',
    ...overrides,
  };

  return User.create(payload);
};

const registerUserViaApi = async (overrides = {}) => {
  const body = {
    role: 'Recipient',
    name: 'Registered User',
    email: uniqueEmail('register'),
    passwordHash: 'StrongPassword123',
    phoneNumber: '01012345678',
    address: 'Cairo',
    ...overrides,
  };

  return jsonRequest('/api/auth/register', { method: 'POST', body });
};

const loginUserViaApi = async ({ email, password = 'StrongPassword123' }) => {
  return jsonRequest('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
};

const getLatestOtpFor = ({ email, purpose }) => {
  const matched = state.sentOtps.filter((entry) => entry.to === email && entry.purpose === purpose);
  return matched.length ? matched[matched.length - 1].otpCode : null;
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test.before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

  await initializeGlobalMongo();
  state.dbAvailable = isSetupComplete();
  process.env.MONGO_URI = getGlobalUri();

  if (!state.dbAvailable) {
    return;
  }

  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGO_URI);
  }

  loadTestAppWithOtpEnabled();

  state.server = state.app.listen(0);
  await new Promise((resolve) => state.server.once('listening', resolve));
  const { port } = state.server.address();
  state.baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  if (state.server) {
    await new Promise((resolve) => state.server.close(resolve));
    state.server = null;
  }

  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
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
  state.failEmails.clear();
});

test('milestone 12: send otp success, validation, and cooldown edge', async (t) => {
  if (!state.dbAvailable) {
    t.skip('MongoDB server is not available for integration testing');
    return;
  }

  const user = await createUser();

  const sendSuccess = await jsonRequest('/api/auth/send-otp', {
    method: 'POST',
    body: { email: user.email, purpose: 'verify' },
  });

  assert.equal(sendSuccess.response.status, 200);
  assert.equal(sendSuccess.payload.success, true);

  const storedOtp = await Otp.findOne({ userId: user._id, purpose: 'verify' }).lean();
  assert.ok(storedOtp);
  assert.equal(storedOtp.otpHash.length, 64);
  assert.equal(state.sentOtps.length, 1);

  const validationFail = await jsonRequest('/api/auth/send-otp', {
    method: 'POST',
    body: { purpose: 'verify' },
  });

  assert.equal(validationFail.response.status, 400);

  const cooldownEdge = await jsonRequest('/api/auth/send-otp', {
    method: 'POST',
    body: { email: user.email, purpose: 'verify' },
  });

  assert.equal(cooldownEdge.response.status, 409);
});

test('milestone 13: verify otp success and error cases', async (t) => {
  if (!state.dbAvailable) {
    t.skip('MongoDB server is not available for integration testing');
    return;
  }

  const successUser = await createUser();
  await jsonRequest('/api/auth/send-otp', {
    method: 'POST',
    body: { email: successUser.email, purpose: 'verify' },
  });
  const validOtp = getLatestOtpFor({ email: successUser.email, purpose: 'verify' });

  const verifySuccess = await jsonRequest('/api/auth/verify-otp', {
    method: 'POST',
    body: { email: successUser.email, otp: validOtp, purpose: 'verify' },
  });

  assert.equal(verifySuccess.response.status, 200);
  assert.equal(verifySuccess.payload.success, true);

  const wrongUser = await createUser({ email: uniqueEmail('wrong-otp') });
  await jsonRequest('/api/auth/send-otp', {
    method: 'POST',
    body: { email: wrongUser.email, purpose: 'reset' },
  });

  const wrongOtp = await jsonRequest('/api/auth/verify-otp', {
    method: 'POST',
    body: { email: wrongUser.email, otp: '000000', purpose: 'reset' },
  });

  assert.equal(wrongOtp.response.status, 400);

  const expiredUser = await createUser({ email: uniqueEmail('expired-otp') });
  await jsonRequest('/api/auth/send-otp', {
    method: 'POST',
    body: { email: expiredUser.email, purpose: 'reset' },
  });

  const expiredCode = getLatestOtpFor({ email: expiredUser.email, purpose: 'reset' });
  await Otp.updateOne(
    { userId: expiredUser._id, purpose: 'reset', isUsed: false },
    { $set: { expiresAt: new Date(Date.now() - 1000) } }
  );

  const expiredOtp = await jsonRequest('/api/auth/verify-otp', {
    method: 'POST',
    body: { email: expiredUser.email, otp: expiredCode, purpose: 'reset' },
  });

  assert.equal(expiredOtp.response.status, 400);
  assert.match(expiredOtp.payload.message, /expired/i);

  const usedOtp = await jsonRequest('/api/auth/verify-otp', {
    method: 'POST',
    body: { email: successUser.email, otp: validOtp, purpose: 'verify' },
  });

  assert.ok(usedOtp.response.status >= 400);

  const attemptsUser = await createUser({ email: uniqueEmail('attempts') });
  await jsonRequest('/api/auth/send-otp', {
    method: 'POST',
    body: { email: attemptsUser.email, purpose: 'reset' },
  });

  await jsonRequest('/api/auth/verify-otp', {
    method: 'POST',
    body: { email: attemptsUser.email, otp: '111111', purpose: 'reset' },
  });
  await jsonRequest('/api/auth/verify-otp', {
    method: 'POST',
    body: { email: attemptsUser.email, otp: '111111', purpose: 'reset' },
  });
  await jsonRequest('/api/auth/verify-otp', {
    method: 'POST',
    body: { email: attemptsUser.email, otp: '111111', purpose: 'reset' },
  });

  const exceeded = await jsonRequest('/api/auth/verify-otp', {
    method: 'POST',
    body: { email: attemptsUser.email, otp: '111111', purpose: 'reset' },
  });

  assert.equal(exceeded.response.status, 409);
});

test('milestone 14: resend otp success and cooldown error', async (t) => {
  if (!state.dbAvailable) {
    t.skip('MongoDB server is not available for integration testing');
    return;
  }

  const user = await createUser();

  await jsonRequest('/api/auth/send-otp', {
    method: 'POST',
    body: { email: user.email, purpose: 'verify' },
  });

  const firstCode = getLatestOtpFor({ email: user.email, purpose: 'verify' });

  const resendTooEarly = await jsonRequest('/api/auth/resend-otp', {
    method: 'POST',
    body: { email: user.email, purpose: 'verify' },
  });
  assert.equal(resendTooEarly.response.status, 409);

  await wait(1200);

  const resendSuccess = await jsonRequest('/api/auth/resend-otp', {
    method: 'POST',
    body: { email: user.email, purpose: 'verify' },
  });

  assert.equal(resendSuccess.response.status, 200);
  const secondCode = getLatestOtpFor({ email: user.email, purpose: 'verify' });
  assert.ok(secondCode);
  assert.notEqual(secondCode, firstCode);
});

test('milestone 15: integration register and reset password flows', async (t) => {
  if (!state.dbAvailable) {
    t.skip('MongoDB server is not available for integration testing');
    return;
  }

  const registration = await registerUserViaApi();
  assert.equal(registration.response.status, 201);

  const registeredEmail = registration.payload.data.user.email;

  const loginBeforeVerify = await loginUserViaApi({ email: registeredEmail, password: 'StrongPassword123' });
  assert.equal(loginBeforeVerify.response.status, 401);

  const registerOtp = getLatestOtpFor({ email: registeredEmail, purpose: 'verify' });
  assert.ok(registerOtp);

  const verifyRegistrationOtp = await jsonRequest('/api/auth/verify-otp', {
    method: 'POST',
    body: { email: registeredEmail, otp: registerOtp, purpose: 'verify' },
  });
  assert.equal(verifyRegistrationOtp.response.status, 200);

  const loginAfterVerify = await loginUserViaApi({ email: registeredEmail, password: 'StrongPassword123' });
  assert.equal(loginAfterVerify.response.status, 200);

  const forgot = await jsonRequest('/api/auth/forgot-password', {
    method: 'POST',
    body: { email: registeredEmail },
  });
  assert.equal(forgot.response.status, 200);

  const resetOtpForVerify = getLatestOtpFor({ email: registeredEmail, purpose: 'reset' });
  assert.ok(resetOtpForVerify);

  const verifyResetOtp = await jsonRequest('/api/auth/verify-otp', {
    method: 'POST',
    body: { email: registeredEmail, otp: resetOtpForVerify, purpose: 'reset' },
  });
  assert.equal(verifyResetOtp.response.status, 200);

  await wait(1200);

  await jsonRequest('/api/auth/forgot-password', {
    method: 'POST',
    body: { email: registeredEmail },
  });
  const resetOtpForReset = getLatestOtpFor({ email: registeredEmail, purpose: 'reset' });

  const resetPassword = await jsonRequest('/api/auth/reset-password', {
    method: 'POST',
    body: {
      token: 'otp-reset-mode',
      email: registeredEmail,
      otp: resetOtpForReset,
      newPassword: 'NewStrongPassword123',
    },
  });

  assert.equal(resetPassword.response.status, 200);

  const loginWithNewPassword = await loginUserViaApi({
    email: registeredEmail,
    password: 'NewStrongPassword123',
  });
  assert.equal(loginWithNewPassword.response.status, 200);
});

test('milestone 16: security tests (brute force, resend spam, expired otp reuse)', async (t) => {
  if (!state.dbAvailable) {
    t.skip('MongoDB server is not available for integration testing');
    return;
  }

  const bruteUser = await createUser({ email: uniqueEmail('bruteforce') });
  await jsonRequest('/api/auth/send-otp', {
    method: 'POST',
    body: { email: bruteUser.email, purpose: 'reset' },
  });

  const bruteStatuses = [];
  for (let i = 0; i < 4; i += 1) {
    const attempt = await jsonRequest('/api/auth/verify-otp', {
      method: 'POST',
      body: { email: bruteUser.email, otp: '999999', purpose: 'reset' },
    });
    bruteStatuses.push(attempt.response.status);
  }
  assert.ok(bruteStatuses.includes(409));

  const spamUser = await createUser({ email: uniqueEmail('spam') });
  await jsonRequest('/api/auth/send-otp', {
    method: 'POST',
    body: { email: spamUser.email, purpose: 'verify' },
  });

  const spamResponses = await Promise.all(
    Array.from({ length: 6 }).map(() => jsonRequest('/api/auth/resend-otp', {
      method: 'POST',
      body: { email: spamUser.email, purpose: 'verify' },
    }))
  );

  const conflictCount = spamResponses.filter((entry) => entry.response.status === 409).length;
  assert.ok(conflictCount >= 1);

  const expiredUser = await createUser({ email: uniqueEmail('expired-reuse') });
  await jsonRequest('/api/auth/send-otp', {
    method: 'POST',
    body: { email: expiredUser.email, purpose: 'reset' },
  });

  const expiredCode = getLatestOtpFor({ email: expiredUser.email, purpose: 'reset' });
  await Otp.updateOne(
    { userId: expiredUser._id, purpose: 'reset', isUsed: false },
    { $set: { expiresAt: new Date(Date.now() - 1000) } }
  );

  const firstExpiredUse = await jsonRequest('/api/auth/verify-otp', {
    method: 'POST',
    body: { email: expiredUser.email, otp: expiredCode, purpose: 'reset' },
  });
  assert.equal(firstExpiredUse.response.status, 400);

  const secondExpiredUse = await jsonRequest('/api/auth/verify-otp', {
    method: 'POST',
    body: { email: expiredUser.email, otp: expiredCode, purpose: 'reset' },
  });
  assert.ok(secondExpiredUse.response.status >= 400);
});

test('milestone 17: concurrency tests for resend and verify', async (t) => {
  if (!state.dbAvailable) {
    t.skip('MongoDB server is not available for integration testing');
    return;
  }

  const resendUser = await createUser({ email: uniqueEmail('concurrent-resend') });
  await jsonRequest('/api/auth/send-otp', {
    method: 'POST',
    body: { email: resendUser.email, purpose: 'verify' },
  });

  await wait(1200);

  const resendConcurrent = await Promise.all([
    jsonRequest('/api/auth/resend-otp', {
      method: 'POST',
      body: { email: resendUser.email, purpose: 'verify' },
    }),
    jsonRequest('/api/auth/resend-otp', {
      method: 'POST',
      body: { email: resendUser.email, purpose: 'verify' },
    }),
  ]);

  const resendSuccessCount = resendConcurrent.filter((entry) => entry.response.status === 200).length;
  const resendFailCount = resendConcurrent.filter((entry) => entry.response.status !== 200).length;
  assert.equal(resendSuccessCount, 1);
  assert.equal(resendFailCount, 1);

  const verifyUser = await createUser({ email: uniqueEmail('concurrent-verify') });
  await jsonRequest('/api/auth/send-otp', {
    method: 'POST',
    body: { email: verifyUser.email, purpose: 'verify' },
  });
  const verifyCode = getLatestOtpFor({ email: verifyUser.email, purpose: 'verify' });

  const verifyConcurrent = await Promise.all([
    jsonRequest('/api/auth/verify-otp', {
      method: 'POST',
      body: { email: verifyUser.email, otp: verifyCode, purpose: 'verify' },
    }),
    jsonRequest('/api/auth/verify-otp', {
      method: 'POST',
      body: { email: verifyUser.email, otp: verifyCode, purpose: 'verify' },
    }),
  ]);

  const verifySuccessCount = verifyConcurrent.filter((entry) => entry.response.status === 200).length;
  const verifyFailCount = verifyConcurrent.filter((entry) => entry.response.status !== 200).length;
  assert.equal(verifySuccessCount, 1);
  assert.equal(verifyFailCount, 1);
});

test('milestone 18: email failure returns proper error and otp remains stored', async (t) => {
  if (!state.dbAvailable) {
    t.skip('MongoDB server is not available for integration testing');
    return;
  }

  const user = await createUser({ email: uniqueEmail('mail-fail') });
  state.failEmails.add(user.email);

  const sendResult = await jsonRequest('/api/auth/send-otp', {
    method: 'POST',
    body: { email: user.email, purpose: 'verify' },
  });

  assert.equal(sendResult.response.status, 400);
  assert.match(sendResult.payload.message, /failed to send otp/i);

  const otpStillStored = await Otp.findOne({ userId: user._id, purpose: 'verify' }).lean();
  assert.ok(otpStillStored);
});

test('milestone 19: performance test for 50 otp requests across multiple users', async (t) => {
  if (!state.dbAvailable) {
    t.skip('MongoDB server is not available for integration testing');
    return;
  }

  const users = await Promise.all(
    Array.from({ length: 50 }).map((_, index) => createUser({ email: uniqueEmail(`perf-${index}`) }))
  );

  const startedAt = Date.now();
  const requests = await Promise.all(users.map((user) => jsonRequest('/api/auth/send-otp', {
    method: 'POST',
    body: { email: user.email, purpose: 'verify' },
  })));
  const durationMs = Date.now() - startedAt;

  const successCount = requests.filter((entry) => entry.response.status === 200).length;
  assert.equal(successCount, 50);

  const otpCount = await Otp.countDocuments({ purpose: 'verify' });
  assert.equal(otpCount, 50);

  assert.ok(durationMs < 20_000);
});

test('milestone 20: cleanup removes expired otp and keeps them unusable', async (t) => {
  if (!state.dbAvailable) {
    t.skip('MongoDB server is not available for integration testing');
    return;
  }

  const user = await createUser({ email: uniqueEmail('cleanup') });
  await jsonRequest('/api/auth/send-otp', {
    method: 'POST',
    body: { email: user.email, purpose: 'reset' },
  });

  const otpCode = getLatestOtpFor({ email: user.email, purpose: 'reset' });
  await Otp.updateOne(
    { userId: user._id, purpose: 'reset', isUsed: false },
    { $set: { expiresAt: new Date(Date.now() - 60_000) } }
  );

  const deletedCount = await state.otpService.cleanupExpiredOtps();
  assert.ok(deletedCount >= 1);

  const afterCleanup = await Otp.findOne({ userId: user._id, purpose: 'reset' });
  assert.equal(afterCleanup, null);

  const verifyAfterCleanup = await jsonRequest('/api/auth/verify-otp', {
    method: 'POST',
    body: { email: user.email, otp: otpCode, purpose: 'reset' },
  });

  assert.ok(verifyAfterCleanup.response.status >= 400);
});
