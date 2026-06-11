const normalizePositiveInteger = (value, fallback, max = Number.POSITIVE_INFINITY) => {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}

	return Math.min(Math.floor(parsed), max);
};

const parsePagination = (query = {}, { defaultLimit = 20, maxLimit = 100 } = {}) => {
	const page = normalizePositiveInteger(query.page, 1);
	const limit = normalizePositiveInteger(query.limit, defaultLimit, maxLimit);
	const skip = (page - 1) * limit;

	return {
		page,
		limit,
		skip,
		hasPagination: Object.prototype.hasOwnProperty.call(query, 'page') || Object.prototype.hasOwnProperty.call(query, 'limit'),
	};
};

module.exports = {
	parsePagination,
};