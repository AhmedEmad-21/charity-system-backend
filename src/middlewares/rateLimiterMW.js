const rateLimit = require('express-rate-limit');
const config = require('../config/appConfig');

const isTestEnv = config.isTest;
const enableInDevelopment = String(process.env.ENABLE_RATE_LIMIT_IN_DEV || '').toLowerCase() === 'true';
const skipLimiter = () => isTestEnv || (!config.isProduction && !enableInDevelopment);
const windowMs = config.securityConfig.rateLimitWindowMinutes * 60 * 1000;
const maxRequests = config.securityConfig.rateLimitMax;

// Default limiter: 100 requests per 15 minutes per IP
const defaultLimiter = rateLimit({
  windowMs,
  max: maxRequests,
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: skipLimiter,
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
  },
});

// Stricter limiter for auth endpoints: 5 requests per minute per IP
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipLimiter,
  message: {
    success: false,
    message: 'Too many login/signup attempts. Please try again later.',
  },
});

const recipientRequestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipLimiter,
  message: {
    success: false,
    message: 'Too many recipient request attempts. Please slow down.',
  },
});

const otpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipLimiter,
  message: {
    success: false,
    message: 'Too many OTP requests. Please wait before retrying.',
  },
});

// Factory to create custom limiters per route
const createLimiter = ({ windowMs = 60 * 1000, max = 60, message = 'Too many requests' } = {}) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message },
  });

module.exports = {
  defaultLimiter,
  authLimiter,
  recipientRequestLimiter,
  otpLimiter,
  createLimiter,
};
