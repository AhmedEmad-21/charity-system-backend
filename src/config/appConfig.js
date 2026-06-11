const dotenv = require("dotenv");

dotenv.config();

const parsePort = (value, fallback) => {
  const port = Number(value ?? fallback);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT value: ${value}`);
  }
  return port;
};

const parseIntEnv = (value, fallback, label) => {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid ${label} value: ${value}`);
  }
  return parsed;
};

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  return (
    normalized === "true" ||
    normalized === "1" ||
    normalized === "yes" ||
    normalized === "on"
  );
};

const parseList = (value, fallback = []) => {
  if (!value || String(value).trim() === "") {
    return fallback;
  }

  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const parseFileSizeToBytes = (value, fallback = "5MB") => {
  const raw = String(value || fallback)
    .trim()
    .toUpperCase();
  const match = raw.match(/^(\d+)(B|KB|MB|GB)?$/);

  if (!match) {
    throw new Error(
      `Invalid MAX_FILE_SIZE format: ${value}. Use values like 5MB, 512KB, 1048576B.`,
    );
  }

  const amount = Number(match[1]);
  const unit = match[2] || "B";
  const multipliers = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
  };

  return amount * multipliers[unit];
};

const requiredValue = (name, value) => {
  if (!value || String(value).trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return String(value).trim();
};

const nodeEnv = (process.env.NODE_ENV || "development").trim().toLowerCase();
if (!["development", "production", "test"].includes(nodeEnv)) {
  throw new Error(`Invalid NODE_ENV value: ${process.env.NODE_ENV}`);
}

const env = {
  NODE_ENV: nodeEnv,
  PORT: process.env.PORT,
  BASE_URL: process.env.BASE_URL,
  APP_TIMEZONE: process.env.APP_TIMEZONE,
  MONGO_URI: process.env.MONGO_URI,
  JWT_SECRET: process.env.JWT_SECRET || process.env.SECRET_KEY,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
  REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET,
  REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN,
  BCRYPT_SALT_ROUNDS: process.env.BCRYPT_SALT_ROUNDS,
  RATE_LIMIT_WINDOW: process.env.RATE_LIMIT_WINDOW,
  RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX,
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  CLOUDINARY_VETTING_FOLDER: process.env.CLOUDINARY_VETTING_FOLDER,
  CLOUDINARY_ITEM_FOLDER: process.env.CLOUDINARY_ITEM_FOLDER,
  MAX_FILE_SIZE: process.env.MAX_FILE_SIZE,
  ALLOWED_FILE_TYPES: process.env.ALLOWED_FILE_TYPES,
  DEFAULT_MONTHLY_POINTS: process.env.DEFAULT_MONTHLY_POINTS,
  LOW_STOCK_THRESHOLD: process.env.LOW_STOCK_THRESHOLD,
  LOG_LEVEL: process.env.LOG_LEVEL,
  TRUSTED_ORIGINS: process.env.TRUSTED_ORIGINS,
  HTTPS_ENABLED: process.env.HTTPS_ENABLED,
  HTTPS_KEY_PATH: process.env.HTTPS_KEY_PATH,
  HTTPS_CERT_PATH: process.env.HTTPS_CERT_PATH,
  ENABLE_ALLOCATION: process.env.ENABLE_ALLOCATION,
  ENABLE_PRIORITY: process.env.ENABLE_PRIORITY,
  ENABLE_OTP_AUTH: process.env.ENABLE_OTP_AUTH,
  DEVELOPER_API_KEY: process.env.DEVELOPER_API_KEY,
  EMAIL_SERVICE: process.env.EMAIL_SERVICE,
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_APP_PASSWORD: process.env.EMAIL_APP_PASSWORD,
  OTP_EXPIRES_IN: process.env.OTP_EXPIRES_IN,
  OTP_LENGTH: process.env.OTP_LENGTH,
  OTP_MAX_ATTEMPTS: process.env.OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN: process.env.OTP_RESEND_COOLDOWN,
};

// Professional startup validation: fail fast on missing critical config.
requiredValue("MONGO_URI", env.MONGO_URI);
requiredValue("JWT_SECRET", env.JWT_SECRET);
requiredValue("REFRESH_TOKEN_SECRET", env.REFRESH_TOKEN_SECRET);

const isProductionEnv = nodeEnv === "production";
if (isProductionEnv) {
  requiredValue("CLOUDINARY_CLOUD_NAME", env.CLOUDINARY_CLOUD_NAME);
  requiredValue("CLOUDINARY_API_KEY", env.CLOUDINARY_API_KEY);
  requiredValue("CLOUDINARY_API_SECRET", env.CLOUDINARY_API_SECRET);
}

if (isProductionEnv && parseBoolean(env.ENABLE_OTP_AUTH, false)) {
  requiredValue("EMAIL_SERVICE", env.EMAIL_SERVICE);
  requiredValue("EMAIL_USER", env.EMAIL_USER);
  requiredValue("EMAIL_APP_PASSWORD", env.EMAIL_APP_PASSWORD);
}

const isDevelopment = nodeEnv === "development";
const isProduction = isProductionEnv;
const isTest = nodeEnv === "test";

const appConfig = Object.freeze({
  env: nodeEnv,
  isDevelopment,
  isProduction,
  isTest,
  serverless: Boolean(process.env.VERCEL),
  timezone: env.APP_TIMEZONE || "Africa/Cairo",
  port: parsePort(env.PORT, 5000),
  baseUrl: env.BASE_URL || "http://localhost:5000",
  trustProxy: isProduction,
  https: {
    enabled: parseBoolean(env.HTTPS_ENABLED, false),
    keyPath: env.HTTPS_KEY_PATH || "",
    certPath: env.HTTPS_CERT_PATH || "",
  },
  cookie: {
    secure: isProduction,
    sameSite: isProduction ? "strict" : "lax",
    httpOnly: true,
  },
});

const dbConfig = Object.freeze({
  mongoUri: env.MONGO_URI,
});

const authConfig = Object.freeze({
  jwtSecret: env.JWT_SECRET,
  jwtExpiresIn: env.JWT_EXPIRES_IN || "1d",
  refreshTokenSecret: env.REFRESH_TOKEN_SECRET,
  refreshTokenExpiresIn: env.REFRESH_TOKEN_EXPIRES_IN || "7d",
});

const cloudinaryConfig = Object.freeze({
  cloudName: env.CLOUDINARY_CLOUD_NAME,
  apiKey: env.CLOUDINARY_API_KEY,
  apiSecret: env.CLOUDINARY_API_SECRET,
  vettingFolder:
    env.CLOUDINARY_VETTING_FOLDER || "charity-system/vetting-documents",
  itemFolder: env.CLOUDINARY_ITEM_FOLDER || "charity-system/items",
});

const securityConfig = Object.freeze({
  bcryptSaltRounds: parseIntEnv(
    env.BCRYPT_SALT_ROUNDS,
    10,
    "BCRYPT_SALT_ROUNDS",
  ),
  rateLimitWindowMinutes: parseIntEnv(
    env.RATE_LIMIT_WINDOW,
    15,
    "RATE_LIMIT_WINDOW",
  ),
  rateLimitMax: parseIntEnv(env.RATE_LIMIT_MAX, 100, "RATE_LIMIT_MAX"),
  trustedOrigins: parseList(env.TRUSTED_ORIGINS, ["*"]),
  // ⚠️ IMPORTANT: DEVELOPER_API_KEY MUST be set in .env file
  // Used for X-Developer-Key header authentication on developer-only endpoints
  // If empty/undefined, developer endpoints (POST /api/dev/managed-accounts) will reject requests
  // Change to a strong secret key. Example: openssl rand -base64 32
  // Used with header: X-Developer-Key: <your-secret-key>
  developerApiKey: env.DEVELOPER_API_KEY || "",
});

const uploadConfig = Object.freeze({
  maxFileSizeRaw: env.MAX_FILE_SIZE || "5MB",
  maxFileSizeBytes: parseFileSizeToBytes(env.MAX_FILE_SIZE, "5MB"),
  allowedFileTypes: parseList(env.ALLOWED_FILE_TYPES, [
    "image/jpeg",
    "image/png",
    "image/webp",
  ]),
});

const systemConfig = Object.freeze({
  defaultMonthlyPoints: parseIntEnv(
    env.DEFAULT_MONTHLY_POINTS,
    100,
    "DEFAULT_MONTHLY_POINTS",
  ),
  lowStockThreshold: parseIntEnv(
    env.LOW_STOCK_THRESHOLD,
    5,
    "LOW_STOCK_THRESHOLD",
  ),
});

const loggingConfig = Object.freeze({
  level:
    env.LOG_LEVEL ||
    (isDevelopment ? "debug" : isProduction ? "error" : "info"),
});

const featureConfig = Object.freeze({
  enableAllocation: parseBoolean(env.ENABLE_ALLOCATION, true),
  enablePriority: parseBoolean(env.ENABLE_PRIORITY, true),
  enableOtpAuth: parseBoolean(env.ENABLE_OTP_AUTH, false),
});

const emailConfig = Object.freeze({
  service: env.EMAIL_SERVICE || "gmail",
  user: env.EMAIL_USER || "",
  appPassword: env.EMAIL_APP_PASSWORD || "",
});

const otpConfig = Object.freeze({
  expiresIn: env.OTP_EXPIRES_IN || "5m",
  length: parseIntEnv(env.OTP_LENGTH, 6, "OTP_LENGTH"),
  maxAttempts: parseIntEnv(env.OTP_MAX_ATTEMPTS, 3, "OTP_MAX_ATTEMPTS"),
  resendCooldownSeconds: parseIntEnv(
    env.OTP_RESEND_COOLDOWN,
    60,
    "OTP_RESEND_COOLDOWN",
  ),
});

const config = Object.freeze({
  appConfig,
  dbConfig,
  authConfig,
  cloudinaryConfig,
  securityConfig,
  uploadConfig,
  systemConfig,
  loggingConfig,
  featureConfig,
  emailConfig,
  otpConfig,

  // Backward compatibility for existing code.
  env: appConfig.env,
  isDevelopment: appConfig.isDevelopment,
  isProduction: appConfig.isProduction,
  isTest: appConfig.isTest,
  port: appConfig.port,
  mongoUri: dbConfig.mongoUri,
  jwt: {
    secret: authConfig.jwtSecret,
    expiresIn: authConfig.jwtExpiresIn,
    refreshSecret: authConfig.refreshTokenSecret,
    refreshExpiresIn: authConfig.refreshTokenExpiresIn,
  },
  cors: {
    origin: securityConfig.trustedOrigins,
  },
  cloudinary: cloudinaryConfig,
  uploads: uploadConfig,
  logging: loggingConfig,
  features: featureConfig,
  email: emailConfig,
  otp: otpConfig,
});

module.exports = config;
