const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { initializeGlobalMongo, cleanupGlobalMongo, getGlobalUri, isSetupComplete } = require('./globalSetup');
const { resetIntegrationMongo } = require('./integrationMongoSetup');

const User = require('../models/userModel');
const Otp = require('../models/otpModel');

const state = {
  dbAvailable: false,
  otpService: null,
};

const loadOtpServiceWithTestEmailMock = () => {
  process.env.ENABLE_OTP_AUTH = 'true';
  process.env.EMAIL_USER = 'test@example.com';
  process.env.EMAIL_APP_PASSWORD = 'app-password';
  process.env.EMAIL_SERVICE = 'gmail';
  process.env.OTP_EXPIRES_IN = '5m';
  process.env.OTP_LENGTH = '6';
  process.env.OTP_MAX_ATTEMPTS = '3';
  process.env.OTP_RESEND_COOLDOWN = '60';

  const pathsToReset = [
    '../config/appConfig',
    '../services/emailService',
    '../services/otpService',
  ];

  for (const relativePath of pathsToReset) {
    const absolutePath = require.resolve(relativePath, { paths: [__dirname] });
    delete require.cache[absolutePath];
  }

  const emailService = require('../services/emailService');
  emailService.sendOTPEmail = async () => ({ messageId: 'mock-message-id' });

  return require('../services/otpService');
};

const createUser = async (overrides = {}) => {
  const payload = {
    role: 'Recipient',
    name: 'Otp Test User',
    email: `otp-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
    passwordHash: 'StrongPassword123',
    phoneNumber: '01012345678',
    address: 'Cairo',
    accountStatus: 'suspended',
    vettingStatus: 'approved',
    ...overrides,
  };

  return User.create(payload);
};

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

  state.otpService = loadOtpServiceWithTestEmailMock();
});

test.after(async () => {
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
});

test('otp send flow creates hashed OTP and enforces cooldown', async (t) => {
  if (!state.dbAvailable) {
    t.skip('MongoDB is not available');
    return;
  }

  const user = await createUser();

  const first = await state.otpService.sendOtpFlow({
    email: user.email,
    purpose: 'verify',
    enforceCooldown: true,
  });

  assert.equal(first.message, 'OTP sent successfully');

  const savedOtp = await Otp.findOne({ userId: user._id, purpose: 'verify' });
  assert.ok(savedOtp);
  assert.equal(savedOtp.otpHash.length, 64);
  assert.equal(savedOtp.isUsed, false);

  await assert.rejects(
    state.otpService.sendOtpFlow({
      email: user.email,
      purpose: 'verify',
      enforceCooldown: true,
    }),
    (error) => error?.code === 'CONFLICT' || /cooldown/i.test(error?.message || '')
  );
});

test('otp verify flow marks otp used and activates account for verify purpose', async (t) => {
  if (!state.dbAvailable) {
    t.skip('MongoDB is not available');
    return;
  }

  const user = await createUser({ accountStatus: 'suspended' });

  const { otpCode } = await state.otpService.createOTP({
    userId: user._id,
    purpose: 'verify',
  });

  const result = await state.otpService.verifyOTP({
    email: user.email,
    purpose: 'verify',
    otpCode,
  });

  assert.equal(result.message, 'OTP verified successfully');

  const updatedUser = await User.findById(user._id).lean();
  assert.equal(updatedUser.accountStatus, 'active');

  const otpDoc = await Otp.findOne({ userId: user._id, purpose: 'verify' }).lean();
  assert.equal(otpDoc.isUsed, true);
});

test('otp verify enforces max attempts and rejects invalid otp', async (t) => {
  if (!state.dbAvailable) {
    t.skip('MongoDB is not available');
    return;
  }

  const user = await createUser();
  await state.otpService.createOTP({ userId: user._id, purpose: 'reset' });

  await assert.rejects(
    state.otpService.verifyOTP({
      email: user.email,
      purpose: 'reset',
      otpCode: '000000',
    }),
    /Invalid OTP/
  );

  await assert.rejects(
    state.otpService.verifyOTP({
      email: user.email,
      purpose: 'reset',
      otpCode: '000000',
    }),
    /Invalid OTP/
  );

  await assert.rejects(
    state.otpService.verifyOTP({
      email: user.email,
      purpose: 'reset',
      otpCode: '000000',
    }),
    /Invalid OTP|attempts exceeded/
  );

  await assert.rejects(
    state.otpService.verifyOTP({
      email: user.email,
      purpose: 'reset',
      otpCode: '000000',
    }),
    /attempts exceeded/i
  );
});

test('otp cleanup job deletes expired otp records', async (t) => {
  if (!state.dbAvailable) {
    t.skip('MongoDB is not available');
    return;
  }

  const user = await createUser();

  await Otp.create({
    userId: user._id,
    otpHash: state.otpService.hashOTP('123456'),
    purpose: 'verify',
    expiresAt: new Date(Date.now() - 60_000),
    attempts: 0,
    isUsed: false,
  });

  const deleted = await state.otpService.cleanupExpiredOtps();
  assert.equal(deleted, 1);

  const left = await Otp.countDocuments({ userId: user._id });
  assert.equal(left, 0);
});
