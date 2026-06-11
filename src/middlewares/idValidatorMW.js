const mongoose = require('mongoose');

const defaultParamNamePattern = /(?:^id$|Id$|_id$)/;

const isObjectId = (value) => typeof value === 'string' && mongoose.Types.ObjectId.isValid(value) && String(mongoose.Types.ObjectId.createFromHexString(value)) === value.toLowerCase();

module.exports = function idValidatorMW(options = {}) {
  const paramNames = Array.isArray(options.paramNames) ? new Set(options.paramNames.map(String)) : null;
  const allowList = options.allowList || defaultParamNamePattern;

  return (req, res, next) => {
    const invalidParams = [];

    for (const [key, value] of Object.entries(req.params || {})) {
      const shouldValidate = paramNames ? paramNames.has(key) : allowList.test(key);
      if (!shouldValidate) {
        continue;
      }

      if (!isObjectId(String(value || ''))) {
        invalidParams.push(key);
      }
    }

    if (invalidParams.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid identifier format',
        errors: invalidParams.map((field) => ({
          field: `params.${field}`,
          message: 'Must be a valid MongoDB ObjectId',
        })),
      });
    }

    return next();
  };
};