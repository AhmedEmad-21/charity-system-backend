const Message = require('../models/messageModel');
const createCrudService = require('./crudServiceFactory');
const { ForbiddenError } = require('../errors/appErrors');
const { parsePagination } = require('../utils/pagination');

const baseService = createCrudService(Message);

const fetchUserMessages = async (userID, options = {}) => {
	const { session = null } = options;
	const { page, limit, hasPagination } = parsePagination(options, { defaultLimit: 20, maxLimit: 100 });
	let query = Message.find({ userID })
		.select('userID relatedDonationID messageType content createdAt isRead')
		.sort({ createdAt: -1 })
		.session(session);

	if (hasPagination) {
		query = query.skip((page - 1) * limit).limit(limit);
	}

	return query;
};

const fetchMessages = async (filter = {}, options = {}) => {
	const { session = null } = options;
	const { page, limit, hasPagination } = parsePagination(options, { defaultLimit: 20, maxLimit: 100 });
	let query = Message.find(filter)
		.select('userID relatedDonationID messageType content createdAt isRead')
		.sort({ createdAt: -1 })
		.session(session);

	if (hasPagination) {
		query = query.skip((page - 1) * limit).limit(limit);
	}

	return query;
};

const markMessageRead = async (id, options = {}) => {
	const { session = null, actorUserID = null, canManageAll = false } = options;
	const message = await Message.findById(id).session(session);
	if (!message) {
		return null;
	}

	if (!canManageAll && actorUserID && String(message.userID) !== String(actorUserID)) {
		throw new ForbiddenError('Forbidden: cannot mark another user message as read');
	}

	if (!message.isRead) {
		message.isRead = true;
		await message.save({ session });
	}

	return message;
};

module.exports = {
	...baseService,
	fetchUserMessages,
	fetchMessages,
	markMessageRead,
	// Backward compatibility for existing service callers.
	create: async (data, options = {}) => baseService.create(data, options),
};
