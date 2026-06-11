class AppError extends Error {
	constructor(status, message, code = 'APP_ERROR', details = null) {
		super(message);
		this.name = this.constructor.name;
		this.status = status;
		this.code = code;
		this.details = details;
		Error.captureStackTrace(this, this.constructor);
	}
}

class BadRequestError extends AppError {
	constructor(message = 'Bad Request', details = null) {
		super(400, message, 'BAD_REQUEST', details);
	}
}

class UnauthorizedError extends AppError {
	constructor(message = 'Unauthorized', details = null) {
		super(401, message, 'UNAUTHORIZED', details);
	}
}

class ForbiddenError extends AppError {
	constructor(message = 'Forbidden', details = null) {
		super(403, message, 'FORBIDDEN', details);
	}
}

class NotFoundError extends AppError {
	constructor(message = 'Not Found', details = null) {
		super(404, message, 'NOT_FOUND', details);
	}
}

class ConflictError extends AppError {
	constructor(message = 'Conflict', details = null) {
		super(409, message, 'CONFLICT', details);
	}
}

module.exports = {
	AppError,
	BadRequestError,
	UnauthorizedError,
	ForbiddenError,
	NotFoundError,
	ConflictError,
};
