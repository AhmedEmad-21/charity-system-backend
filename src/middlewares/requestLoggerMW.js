const pino = require("pino");
const config = require("../config/appConfig");
const { formatEgyptDateTime } = require("../utils/timezone");

const logger = pino({
  level: config.logging.level,
});

// Structured request logger capturing method, url, status, duration, user and ip
module.exports = function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;

    const userId =
      req.user?.id || req.user?._id || req.user?.userId || "anonymous";
    const log = {
      time: formatEgyptDateTime(new Date(), config.appConfig.timezone),
      method: req.method,
      url: req.originalUrl || req.url,
      status: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      ip:
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.ip ||
        req.connection?.remoteAddress,
      user: userId,
    };

    logger.info(log, "request completed");
  });

  next();
};
