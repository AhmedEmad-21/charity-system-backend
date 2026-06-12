const EGYPT_TIMEZONE = "Africa/Cairo";

const formatEgyptDateTime = (date = new Date(), timeZone = EGYPT_TIMEZONE) => {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date(date));
  const get = (type) => parts.find((part) => part.type === type)?.value || "";

  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
};

const ISO_UTC_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const isPlainObject = (value) => {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isMongoObjectId = (value) => {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof value.toHexString === "function" &&
    (value._bsontype === "ObjectId" || value._bsontype === "ObjectID")
  );
};

// Keep Date values in DB as-is (UTC instant), but normalize API output display to Egypt time.
const normalizeResponseTimestamps = (
  value,
  timeZone = EGYPT_TIMEZONE,
  seen = new WeakSet(),
) => {
  if (value instanceof Date) {
    return formatEgyptDateTime(value, timeZone);
  }

  if (isMongoObjectId(value)) {
    return value.toString();
  }

  if (value && typeof value === "object") {
    if (seen.has(value)) {
      return undefined;
    }

    seen.add(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      normalizeResponseTimestamps(item, timeZone, seen),
    );
  }

  if (typeof value === "string" && ISO_UTC_REGEX.test(value)) {
    return formatEgyptDateTime(value, timeZone);
  }

  if (isPlainObject(value)) {
    const normalized = {};
    for (const [key, fieldValue] of Object.entries(value)) {
      normalized[key] = normalizeResponseTimestamps(fieldValue, timeZone, seen);
    }
    return normalized;
  }

  return value;
};

const getNowEgyptTime = () => {
  const now = new Date();
  // Get Egypt time and convert back to a Date object representing that moment
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: EGYPT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";

  const egyptDateString = `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
  return new Date(egyptDateString);
};

module.exports = {
  EGYPT_TIMEZONE,
  formatEgyptDateTime,
  normalizeResponseTimestamps,
  getNowEgyptTime,
};
