const sanitizeObject = (value) => {
  if (Array.isArray(value)) {
    return value.map(sanitizeObject);
  }

  if (value && typeof value === 'object') {
    const sanitized = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      // Block NoSQL operator keys and dotted keys often used in injection payloads.
      if (key.startsWith('$') || key.includes('.')) {
        continue;
      }

      sanitized[key] = sanitizeObject(nestedValue);
    }

    return sanitized;
  }

  return value;
};

module.exports = function inputSanitizerMW(req, res, next) {
  req.body = sanitizeObject(req.body || {});
  req.query = sanitizeObject(req.query || {});
  req.params = sanitizeObject(req.params || {});
  next();
};
