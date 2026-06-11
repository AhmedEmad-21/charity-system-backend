const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");
const config = require("../config/appConfig");
const {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} = require("../errors/appErrors");
const {
  issueToken,
  verifyToken: verifyAccessToken,
  revokeToken,
  isTokenRevoked,
} = require("./tokenService");
const otpService = require("./otpService");

const normalizeEmail = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const sanitizeUser = (userDoc) => {
  const user = userDoc.toObject();
  delete user.passwordHash;
  delete user.resetPasswordTokenHash;
  delete user.resetPasswordExpiresAt;
  return user;
};

const generateTokens = (user) => {
  const basePayload = {
    id: user._id,
    role: user.role,
    email: user.email,
    vettingStatus: user.vettingStatus,
  };

  const accessToken = issueToken({ ...basePayload, tokenType: "access" });
  const refreshToken = issueToken(
    { ...basePayload, tokenType: "refresh" },
    { expiresIn: "7d" },
  );

  return {
    accessToken,
    refreshToken,
  };
};

const registerUser = async (payload, options = {}) => {
  const allowPrivilegedRoles = Boolean(options.allowPrivilegedRoles);
  const role = String(payload.role || "").trim();
  if (
    config.isProduction &&
    !allowPrivilegedRoles &&
    ["Staff", "Admin"].includes(role)
  ) {
    throw new ForbiddenError(
      "Privileged accounts must be created from the admin dashboard",
    );
  }

  const existingUser = await User.findOne({
    email: normalizeEmail(payload.email),
  });
  if (existingUser) {
    throw new ConflictError("Email already exists");
  }

  const user = await User.create({
    ...payload,
    accountStatus: config.features.enableOtpAuth
      ? "suspended"
      : payload.accountStatus || "active",
  });

  if (config.features.enableOtpAuth) {
    await otpService.sendOtpFlow({
      email: user.email,
      purpose: "verify",
      enforceCooldown: false,
    });
  }

  const tokens = generateTokens(user);

  return {
    user: sanitizeUser(user),
    ...tokens,
  };
};

const loginUser = async ({ email, password }) => {
  const user = await User.findOne({ email: normalizeEmail(email) });
  if (!user) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw new UnauthorizedError("Invalid email or password");
  }

  if (config.features.enableOtpAuth && user.accountStatus !== "active") {
    throw new UnauthorizedError(
      "Account is not verified yet. Please verify OTP first.",
    );
  }

  const tokens = generateTokens(user);
  return {
    user: sanitizeUser(user),
    ...tokens,
  };
};

const verifyToken = async (token) => verifyAccessToken(token);

const refreshUserToken = async (refreshToken) => {
  if (!refreshToken) {
    throw new BadRequestError("Refresh token is required");
  }

  if (await isTokenRevoked(refreshToken)) {
    throw new UnauthorizedError("Invalid refresh token");
  }

  const payload = verifyAccessTokenForRefresh(refreshToken);
  const user = await User.findById(payload.id);
  if (!user) {
    throw new NotFoundError("User not found");
  }

  const tokens = generateTokens(user);
  await revokeToken(refreshToken);

  return {
    user: sanitizeUser(user),
    ...tokens,
  };
};

const verifyAccessTokenForRefresh = (token) => {
  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret);
  } catch (error) {
    error.status = 401;
    throw error;
  }

  if (payload?.tokenType !== "refresh") {
    throw new UnauthorizedError("Invalid token type");
  }

  return payload;
};

const logoutUser = async (token, refreshToken) => {
  await Promise.all([revokeToken(token), revokeToken(refreshToken)]);
  return { message: "Logged out successfully" };
};

const sendResetEmail = async (email) => {
  const user = await User.findOne({ email: normalizeEmail(email) });
  if (!user) {
    return { message: "If this email exists, a reset link has been sent" };
  }

  if (config.features.enableOtpAuth) {
    await otpService.sendOtpFlow({
      email: user.email,
      purpose: "reset",
      enforceCooldown: true,
    });

    return {
      message: "If this email exists, a reset code has been sent",
      method: "otp",
    };
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  user.resetPasswordTokenHash = tokenHash;
  user.resetPasswordExpiresAt = expiresAt;
  await user.save();

  return {
    message: "Password reset token generated",
    resetToken: process.env.NODE_ENV === "production" ? undefined : rawToken,
    expiresAt,
  };
};

const resetUserPassword = async ({ token, newPassword, email, otp }) => {
  if (!token || !newPassword) {
    throw new BadRequestError("Token and newPassword are required");
  }

  if (String(newPassword).length < 8) {
    throw new BadRequestError("New password must be at least 8 characters");
  }

  let user = null;

  if (config.features.enableOtpAuth) {
    try {
      let emailValue = email;
      let otpCode = otp;

      // Backward-compatible format: token=base64("email:otp")
      if ((!emailValue || !otpCode) && token) {
        const decoded = Buffer.from(String(token), "base64").toString("utf8");
        const [decodedEmail, decodedOtp] = decoded.split(":");
        emailValue = emailValue || decodedEmail;
        otpCode = otpCode || decodedOtp;
      }

      if (!emailValue || !otpCode) {
        throw new Error("missing email/otp for otp reset flow");
      }

      await otpService.verifyOTP({
        email: emailValue,
        purpose: "reset",
        otpCode,
      });

      user = await User.findOne({ email: normalizeEmail(emailValue) });
    } catch (error) {
      throw new BadRequestError("Invalid or expired reset token");
    }
  } else {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    user = await User.findOne({
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpiresAt: { $gt: new Date() },
    });
  }

  if (!user) {
    throw new BadRequestError("Invalid or expired reset token");
  }

  user.passwordHash = newPassword;
  user.resetPasswordTokenHash = null;
  user.resetPasswordExpiresAt = null;
  await user.save();

  return { message: "Password reset successful" };
};

const getMe = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError("User not found");
  }

  return sanitizeUser(user);
};

const sendOTP = async ({ email, purpose = "verify" }) => {
  return otpService.sendOtpFlow({ email, purpose, enforceCooldown: true });
};

const resendOTP = async ({ email, purpose = "verify" }) => {
  return otpService.sendOtpFlow({ email, purpose, enforceCooldown: true });
};

const verifyUserOTP = async ({ email, otp, purpose = "verify" }) => {
  return otpService.verifyOTP({ email, otpCode: otp, purpose });
};

module.exports = {
  registerUser,
  loginUser,
  generateTokens,
  verifyToken,
  refreshUserToken,
  logoutUser,
  sendResetEmail,
  resetUserPassword,
  getMe,
  sendOTP,
  resendOTP,
  verifyUserOTP,
  // Backward compatibility with existing callers
  register: registerUser,
  login: loginUser,
};
