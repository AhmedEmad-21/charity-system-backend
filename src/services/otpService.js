const crypto = require("crypto");
const Otp = require("../models/otpModel");
const User = require("../models/userModel");
const SystemAuditLog = require("../models/systemAuditLogModel");
const config = require("../config/appConfig");
const {
  BadRequestError,
  NotFoundError,
  ConflictError,
} = require("../errors/appErrors");
const { sendOTPEmail, isEmailConfigured } = require("./emailService");
const { getNowEgyptTime, formatEgyptDateTime } = require("../utils/timezone");

const parseDurationToMs = (duration = "5m") => {
  const value = String(duration).trim().toLowerCase();
  const match = value.match(/^(\d+)(s|m|h|d)$/);

  if (!match) {
    throw new Error(`Invalid OTP duration format: ${duration}`);
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const factor = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  return amount * factor;
};

const getOtpExpireMinutes = () =>
  Math.max(1, Math.round(parseDurationToMs(config.otp.expiresIn) / 60_000));

const generateOTP = () => {
  const digits = config.otp.length;
  const min = 10 ** (digits - 1);
  const max = 10 ** digits - 1;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
};

const hashOTP = (otpCode) => {
  return crypto.createHash("sha256").update(String(otpCode)).digest("hex");
};

const writeOtpAudit = async (eventType, status, details) => {
  try {
    await SystemAuditLog.create({
      eventType,
      status,
      details,
      // Audit logs always use server's current time (UTC stored, displayed as Egypt time)
      executedAt: new Date(),
    });
  } catch (error) {
    console.error("[OTP] Audit log failure:", error.message);
  }
};

const ensureOtpEnabled = () => {
  if (!config.features.enableOtpAuth) {
    throw new BadRequestError("OTP feature is disabled");
  }
};

const findUserByEmail = async (email) => {
  if (!email) {
    throw new BadRequestError("email is required");
  }

  const user = await User.findOne({
    email: String(email).trim().toLowerCase(),
  });
  if (!user) {
    throw new NotFoundError("User not found");
  }
  return user;
};

const checkOtpCooldown = async (userId, purpose) => {
  const latestOtp = await Otp.findOne({ userId, purpose }).sort({
    createdAt: -1,
  });
  if (!latestOtp) {
    return null;
  }

  const cooldownMs = config.otp.resendCooldownSeconds * 1000;
  const elapsed = Date.now() - new Date(latestOtp.createdAt).getTime();
  if (elapsed < cooldownMs) {
    const waitSeconds = Math.ceil((cooldownMs - elapsed) / 1000);
    throw new ConflictError(
      `OTP resend cooldown active. Try again in ${waitSeconds} seconds.`,
      {
        code: "OTP_COOLDOWN",
        waitSeconds,
      },
    );
  }

  return latestOtp;
};

const invalidateOTP = async (userId, purpose) => {
  await Otp.updateMany(
    { userId, purpose, isUsed: false },
    { $set: { isUsed: true, usedAt: new Date() } },
  );
};

const createOTP = async ({ userId, purpose }) => {
  const otpCode = generateOTP();
  const otpHash = hashOTP(otpCode);
  // Calculate expiry using Egypt timezone
  const expiresAt = new Date(
    Date.now() + parseDurationToMs(config.otp.expiresIn),
  );

  let otpDoc;
  try {
    otpDoc = await Otp.create({
      userId,
      otpHash,
      purpose,
      expiresAt,
      attempts: 0,
      isUsed: false,
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw new ConflictError(
        "OTP request already in progress. Please retry in a moment.",
      );
    }
    throw error;
  }

  return { otpDoc, otpCode };
};

const sendOtpFlow = async ({
  email,
  purpose = "verify",
  enforceCooldown = true,
}) => {
  ensureOtpEnabled();

  if (!isEmailConfigured()) {
    throw new BadRequestError("Email provider is not configured");
  }

  const user = await findUserByEmail(email);

  if (enforceCooldown) {
    await checkOtpCooldown(user._id, purpose);
  }

  await invalidateOTP(user._id, purpose);
  const { otpCode } = await createOTP({ userId: user._id, purpose });

  try {
    await sendOTPEmail({
      to: user.email,
      otpCode,
      expiresInMinutes: getOtpExpireMinutes(),
      purpose,
    });

    await writeOtpAudit("otp_sent", "success", {
      userId: String(user._id),
      purpose,
      email: user.email,
    });
  } catch (error) {
    await writeOtpAudit("otp_sent", "failed", {
      userId: String(user._id),
      purpose,
      email: user.email,
      error: error.message,
    });
    throw new BadRequestError("Failed to send OTP email");
  }

  return {
    message: "OTP sent successfully",
    purpose,
    cooldownSeconds: config.otp.resendCooldownSeconds,
  };
};

const verifyOTP = async ({ email, purpose = "verify", otpCode }) => {
  ensureOtpEnabled();

  if (!otpCode) {
    throw new BadRequestError("otp is required");
  }

  const user = await findUserByEmail(email);
  const otpDoc = await Otp.findOne({
    userId: user._id,
    purpose,
    isUsed: false,
  }).sort({ createdAt: -1 });

  if (!otpDoc) {
    throw new NotFoundError("No active OTP found");
  }

  if (new Date(otpDoc.expiresAt).getTime() < Date.now()) {
    otpDoc.isUsed = true;
    otpDoc.usedAt = new Date();
    await otpDoc.save();
    throw new BadRequestError("OTP expired");
  }

  if (otpDoc.attempts >= config.otp.maxAttempts) {
    await writeOtpAudit("otp_attempts_exceeded", "failed", {
      userId: String(user._id),
      purpose,
      attempts: otpDoc.attempts,
    });
    throw new ConflictError("OTP attempts exceeded");
  }

  const providedHash = hashOTP(otpCode);
  if (providedHash !== otpDoc.otpHash) {
    otpDoc.attempts += 1;
    await otpDoc.save();

    if (otpDoc.attempts >= config.otp.maxAttempts) {
      await writeOtpAudit("otp_attempts_exceeded", "failed", {
        userId: String(user._id),
        purpose,
        attempts: otpDoc.attempts,
      });
    }

    throw new BadRequestError("Invalid OTP");
  }

  const consumeResult = await Otp.updateOne(
    { _id: otpDoc._id, isUsed: false },
    { $set: { isUsed: true, usedAt: new Date() } },
  );

  if (!consumeResult.modifiedCount) {
    throw new ConflictError("OTP already used");
  }

  await invalidateOTP(user._id, purpose);

  if (purpose === "verify") {
    user.accountStatus = "active";
    await user.save();
  }

  await writeOtpAudit("otp_verified", "success", {
    userId: String(user._id),
    purpose,
  });

  return {
    message: "OTP verified successfully",
    purpose,
    userId: String(user._id),
  };
};

const cleanupExpiredOtps = async () => {
  const result = await Otp.deleteMany({ expiresAt: { $lt: new Date() } });
  await writeOtpAudit("otp_cleanup", "success", {
    deletedCount: result.deletedCount,
  });
  return result.deletedCount;
};

module.exports = {
  generateOTP,
  hashOTP,
  createOTP,
  verifyOTP,
  invalidateOTP,
  sendOtpFlow,
  cleanupExpiredOtps,
};
