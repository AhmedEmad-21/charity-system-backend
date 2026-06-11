const User = require("../models/userModel");
const { BadRequestError, ConflictError } = require("../errors/appErrors");
const { parsePagination } = require("../utils/pagination");

const PUBLIC_USER_SELECT =
  "-passwordHash -resetPasswordTokenHash -resetPasswordExpiresAt";

const buildSearchRegex = (value) => new RegExp(String(value || "").trim(), "i");

const buildFilterQuery = (filters = {}) => {
  const query = {};

  if (filters.role) {
    query.role = String(filters.role);
  }

  if (filters.accountStatus) {
    query.accountStatus = String(filters.accountStatus);
  }

  if (filters.vettingStatus) {
    query.vettingStatus = String(filters.vettingStatus);
  }

  if (filters.email) {
    query.email = String(filters.email).toLowerCase();
  }

  if (filters.createdByAdminID) {
    query.createdByAdminID = filters.createdByAdminID;
  }

  return query;
};

const fetchUsers = async (options = {}) => {
  const { session = null } = options;
  const { page, limit, hasPagination } = parsePagination(options, {
    defaultLimit: 20,
    maxLimit: 100,
  });

  let query = User.find({})
    .select(PUBLIC_USER_SELECT)
    .sort({ createdAt: -1 })
    .session(session);
  if (hasPagination) {
    query = query.skip((page - 1) * limit).limit(limit);
  }

  return query;
};

const fetchUserById = async (id) => {
  return User.findById(id).select(PUBLIC_USER_SELECT);
};

const updateUserData = async (id, payload) => {
  const user = await User.findById(id);
  if (!user) {
    return null;
  }

  const allowedFields = [
    "role",
    "name",
    "email",
    "phoneNumber",
    "address",
    "accountStatus",
    "vettingStatus",
    "createdByAdminID",
  ];
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      user[field] = payload[field];
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(payload, "password") &&
    payload.password
  ) {
    user.passwordHash = String(payload.password);
  }

  if (
    Object.prototype.hasOwnProperty.call(payload, "passwordHash") &&
    payload.passwordHash
  ) {
    user.passwordHash = String(payload.passwordHash);
  }

  await user.save();
  return fetchUserById(id);
};

const deleteUserById = async (id) => {
  return User.findByIdAndDelete(id).select(PUBLIC_USER_SELECT);
};

const searchUsersLogic = async (queryValue, options = {}) => {
  const keyword = String(queryValue || "").trim();
  if (!keyword) {
    return [];
  }

  const { session = null } = options;
  const { page, limit, hasPagination } = parsePagination(options, {
    defaultLimit: 20,
    maxLimit: 100,
  });

  const regex = buildSearchRegex(keyword);
  let query = User.find({
    $or: [{ name: regex }, { email: regex }, { phoneNumber: regex }],
  })
    .select(PUBLIC_USER_SELECT)
    .sort({ createdAt: -1 })
    .session(session);

  if (hasPagination) {
    query = query.skip((page - 1) * limit).limit(limit);
  }

  return query;
};

const filterUsersLogic = async (filters = {}, options = {}) => {
  const query = buildFilterQuery(filters);
  const { session = null } = options;
  const { page, limit, hasPagination } = parsePagination(options, {
    defaultLimit: 20,
    maxLimit: 100,
  });

  let dbQuery = User.find(query)
    .select(PUBLIC_USER_SELECT)
    .sort({ createdAt: -1 })
    .session(session);
  if (hasPagination) {
    dbQuery = dbQuery.skip((page - 1) * limit).limit(limit);
  }

  return dbQuery;
};

const findByEmail = async (email) => {
  return User.findOne({ email: String(email).toLowerCase() });
};

const createManagedUser = async (payload = {}, actorUserID = null) => {
  const role = String(payload.role || "").trim();
  if (!["Staff", "Admin"].includes(role)) {
    throw new BadRequestError(
      "Only Staff and Admin accounts can be created from this endpoint",
    );
  }

  const email = String(payload.email || "")
    .trim()
    .toLowerCase();
  if (!email) {
    throw new BadRequestError("Email is required");
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ConflictError("Email already exists");
  }

  const user = await User.create({
    role,
    name: payload.name,
    email,
    passwordHash: payload.password || payload.passwordHash,
    phoneNumber: payload.phoneNumber,
    address: payload.address,
    accountStatus: payload.accountStatus || "active",
    vettingStatus: payload.vettingStatus || "pending",
    createdByAdminID: actorUserID || null,
  });

  return User.findById(user._id).select(PUBLIC_USER_SELECT);
};

module.exports = {
  fetchUsers,
  fetchUserById,
  updateUserData,
  deleteUserById,
  searchUsersLogic,
  filterUsersLogic,
  findByEmail,
  createManagedUser,
  PUBLIC_USER_SELECT,
};
