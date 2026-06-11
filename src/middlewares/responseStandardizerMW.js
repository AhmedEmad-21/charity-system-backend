const config = require("../config/appConfig");
const { normalizeResponseTimestamps } = require("../utils/timezone");

module.exports = function responseStandardizerMW(req, res, next) {
  const originalJson = res.json.bind(res);
  const toEgyptTime = (value) =>
    normalizeResponseTimestamps(value, config.appConfig.timezone);

  res.json = (body) => {
    if (body === null || body === undefined) {
      return originalJson({ success: true, message: "done", data: null });
    }

    if (typeof body !== "object" || Array.isArray(body)) {
      return originalJson({
        success: true,
        message: "done",
        data: toEgyptTime(body),
      });
    }

    if (Object.prototype.hasOwnProperty.call(body, "success")) {
      if (body.success === true) {
        return originalJson({
          ...toEgyptTime(body),
          message: body.message || "done",
          data: Object.prototype.hasOwnProperty.call(body, "data")
            ? toEgyptTime(body.data)
            : (body.data ?? {}),
        });
      }

      return originalJson({
        ...toEgyptTime(body),
        message: body.message || "error",
      });
    }

    return originalJson({
      success: true,
      message: "done",
      data: toEgyptTime(body),
    });
  };

  next();
};
