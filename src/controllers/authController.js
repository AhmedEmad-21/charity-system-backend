const authService = require('../services/authService');

const authController = {
  async register(req, res, next) {
    try {
      const data = await authService.registerUser(req.body);
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return next(error);
    }
  },

  async login(req, res, next) {
    try {
      const data = await authService.loginUser(req.body);
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return next(error);
    }
  },

  async getMe(req, res, next) {
    try {
      const data = await authService.getMe(req.user?.id);
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return next(error);
    }
  },

  async refreshToken(req, res, next) {
    try {
      const data = await authService.refreshUserToken(req.body?.refreshToken);
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return next(error);
    }
  },

  async logout(req, res, next) {
    try {
      const authHeader = req.headers['authorization'] || req.headers['Authorization'];
      const token = authHeader ? String(authHeader).split(' ')[1] : null;
      const data = await authService.logoutUser(token, req.body?.refreshToken);
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return next(error);
    }
  },

  async forgotPassword(req, res, next) {
    try {
      const data = await authService.sendResetEmail(req.body?.email);
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return next(error);
    }
  },

  async resetPassword(req, res, next) {
    try {
      const data = await authService.resetUserPassword({
        token: req.body?.token,
        newPassword: req.body?.newPassword,
        email: req.body?.email,
        otp: req.body?.otp,
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return next(error);
    }
  },

  async sendOTP(req, res, next) {
    try {
      const data = await authService.sendOTP({
        email: req.body?.email,
        purpose: req.body?.purpose || 'verify',
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return next(error);
    }
  },

  async verifyOTP(req, res, next) {
    try {
      const data = await authService.verifyUserOTP({
        email: req.body?.email,
        otp: req.body?.otp,
        purpose: req.body?.purpose || 'verify',
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return next(error);
    }
  },

  async resendOTP(req, res, next) {
    try {
      const data = await authService.resendOTP({
        email: req.body?.email,
        purpose: req.body?.purpose || 'verify',
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return next(error);
    }
  },
};

module.exports = authController;
