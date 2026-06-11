const ROLES = Object.freeze({
  DONOR: 'Donor',
  RECIPIENT: 'Recipient',
  STAFF: 'Staff',
  ADMIN: 'Admin',
});

const REQUEST_STATUS = Object.freeze({
  PENDING: 'pending',
  PROCESSING: 'processing',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  FULFILLED: 'fulfilled',
});

const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
});

const DEFAULT_LIMITS = Object.freeze({
  DEFAULT_MONTHLY_POINTS: 100,
  LOW_STOCK_THRESHOLD: 5,
  RATE_LIMIT_WINDOW_MINUTES: 15,
  RATE_LIMIT_MAX: 100,
  MAX_FILE_SIZE_MB: 5,
});

module.exports = {
  ROLES,
  REQUEST_STATUS,
  PAYMENT_STATUS,
  DEFAULT_LIMITS,
};
