const config = require("../config/appConfig");
const { ForbiddenError, UnauthorizedError } = require("../errors/appErrors");

/**
 * Middleware to protect developer-only endpoints
 *
 * Requirements:
 * 1. DEVELOPER_API_KEY must be set in .env file (non-empty string)
 * 2. Client must send X-Developer-Key header matching the .env value
 * 3. Disabled automatically in production mode (TEMPORARILY BYPASSED FOR TESTING)
 *
 * Usage:
 *   Header: X-Developer-Key: dev-testing-secret-key-12345
 */
module.exports = function developerAccessMW(req, res, next) {
  // 🚫 تم إيقاف هذا الشيك مؤقتاً لتشغيل الـ Endpoint في أي بيئة (بما فيها الـ Production على السيرفر)
  /*
  if (config.isProduction) {
    return next(
      new ForbiddenError(
        "Developer testing endpoints are disabled in production",
      ),
    );
  }
  */

  // Check if DEVELOPER_API_KEY is configured in .env
  const configuredKey = String(
    config.securityConfig.developerApiKey || "",
  ).trim();
  if (!configuredKey) {
    return next(
      new UnauthorizedError(
        "Developer API key is not configured in .env (DEVELOPER_API_KEY=<your-strong-secret-key>)",
      ),
    );
  }

  // Validate X-Developer-Key header from client request
  const providedKey = String(req.headers["x-developer-key"] || "").trim();
  if (!providedKey || providedKey !== configuredKey) {
    return next(
      new UnauthorizedError(
        "Unauthorized: invalid developer key in X-Developer-Key header",
      ),
    );
  }

  return next();
};
