const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true, $data: true });
addFormats(ajv);

ajv.addKeyword({
    keyword: 'withinMonthlyLimit',
    type: 'object',
    schemaType: 'boolean',
    validate: function withinMonthlyLimitKeyword(enabled, data) {
        if (!enabled) return true;

        const quantity = Number(data?.quantity ?? 0);
        const pastMonthlyTotal = Number(data?.pastMonthlyTotal ?? 0);
        const monthlyLimit = Number(data?.monthlyLimit ?? Number.POSITIVE_INFINITY);

        if (!Number.isFinite(quantity) || !Number.isFinite(pastMonthlyTotal) || !Number.isFinite(monthlyLimit)) {
            return false;
        }

        return quantity + pastMonthlyTotal <= monthlyLimit;
    },
});

const compileSchema = (schema) => ajv.compile(schema);

const runValidation = async (validateFunction, payload) => {
    try {
        await validateFunction(payload);
        return null;
    } catch (error) {
        return error;
    }
};

const normalizeValidationErrors = (validateFunction, error) => {
    const validationErrors = error?.errors || validateFunction.errors || [];
    return validationErrors.map((validationError) => ({
        field: validationError.instancePath || validationError.schemaPath || '',
        message: validationError.message || 'Invalid value',
    }));
};

const getValidationTargets = (schemaOrConfig) => {
    if (schemaOrConfig && typeof schemaOrConfig === 'object' && (schemaOrConfig.body || schemaOrConfig.query || schemaOrConfig.params)) {
        return schemaOrConfig;
    }

    return { body: schemaOrConfig };
};

const validateSchema = (schemaOrConfig) => {
    const validationTargets = getValidationTargets(schemaOrConfig);
    const validators = Object.fromEntries(
        Object.entries(validationTargets)
            .filter(([, schema]) => Boolean(schema))
            .map(([source, schema]) => [source, compileSchema(schema)])
    );

    return async (req, res, next) => {
        try {
            for (const [source, validateFunction] of Object.entries(validators)) {
                const payload = req[source] || {};
                const error = await runValidation(validateFunction, payload);

                if (error) {
                    return res.status(400).json({
                        success: false,
                        message: 'Validation failed',
                        source,
                        errors: normalizeValidationErrors(validateFunction, error),
                    });
                }
            }

            return next();
        } catch (error) {
            return next(error);
        }
    };
};

module.exports = validateSchema;