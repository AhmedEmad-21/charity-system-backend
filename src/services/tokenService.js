const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config/appConfig');
const RevokedToken = require('../models/revokedTokenModel');
const { UnauthorizedError } = require('../errors/appErrors');

const revokedTokenCache = new Set();

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

const tokenExpiryFromPayload = (payload) => {
  // Fallback to +7 days when exp is unavailable.
  if (!payload?.exp) {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }

  return new Date(Number(payload.exp) * 1000);
};

const issueToken = (payload, options = {}) => jwt.sign(payload, config.jwt.secret, {
  expiresIn: options.expiresIn || config.jwt.expiresIn,
});

const revokeToken = async (token) => {
  if (token) {
    const tokenHash = hashToken(token);
    revokedTokenCache.add(tokenHash);

    try {
      const decoded = jwt.decode(token);
      await RevokedToken.updateOne(
        { tokenHash },
        { $set: { tokenHash, expiresAt: tokenExpiryFromPayload(decoded) } },
        { upsert: true }
      );
    } catch (error) {
      // Keep auth flow resilient even if revoke persistence fails.
      console.error('[TokenService] Failed to persist revoked token:', error.message);
    }
  }
};

const isTokenRevoked = async (token) => {
  if (!token) {
    return false;
  }

  const tokenHash = hashToken(token);
  if (revokedTokenCache.has(tokenHash)) {
    return true;
  }

  const found = await RevokedToken.findOne({ tokenHash }).select('_id').lean();
  if (found) {
    revokedTokenCache.add(tokenHash);
    return true;
  }

  return false;
};

const verifyToken = async (token) => {
  if (await isTokenRevoked(token)) {
    throw new UnauthorizedError('Token revoked');
  }

  const decoded = jwt.verify(token, config.jwt.secret);
  if (decoded?.tokenType && decoded.tokenType !== 'access') {
    throw new UnauthorizedError('Invalid token type');
  }

  return decoded;
};

module.exports = {
  issueToken,
  verifyToken,
  revokeToken,
  isTokenRevoked,
};
