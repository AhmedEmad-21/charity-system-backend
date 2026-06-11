const { verifyToken } = require('../services/tokenService');
const { UnauthorizedError } = require('../errors/appErrors');

// Authenticate requests by verifying JWT once and attaching user to req
module.exports = async function authMW(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (!authHeader) {
      return next(new UnauthorizedError('Unauthorized: Missing Authorization header'));
    }

    const [scheme, token] = String(authHeader).split(' ');
    if (!token || !/^Bearer$/i.test(scheme)) {
      return next(new UnauthorizedError('Unauthorized: Invalid Authorization format'));
    }

    const verified = await verifyToken(token);
    req.user = verified;
    return next();
  } catch (err) {
    if (err?.name === 'TokenExpiredError' || err?.name === 'JsonWebTokenError' || err?.status === 401) {
      return next(new UnauthorizedError('Unauthorized: invalid or expired token'));
    }

    return next(err);
  }
}
