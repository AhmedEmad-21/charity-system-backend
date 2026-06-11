const User = require('../models/userModel');

module.exports = function vettingStatusMW(allowedStatuses = ['approved'], options = {}) {
  const normalizedAllowed = new Set(allowedStatuses.map((status) => String(status).toLowerCase()));
  const exemptRoles = new Set((options.exemptRoles || ['staff', 'admin']).map((role) => String(role).toLowerCase()));

  return async (req, res, next) => {
    try {
      const userId = req.user?.id || req.user?._id || req.user?.userId;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized: user not authenticated' });
      }

      const user = await User.findById(userId).select('vettingStatus role');
      if (!user) {
        return res.status(401).json({ success: false, message: 'Unauthorized: user not found' });
      }

      if (exemptRoles.has(String(user.role).toLowerCase())) {
        req.user.vettingStatus = user.vettingStatus;
        return next();
      }

      req.user.vettingStatus = user.vettingStatus;

      if (!normalizedAllowed.has(String(user.vettingStatus).toLowerCase())) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: vetting status is not approved',
        });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
};