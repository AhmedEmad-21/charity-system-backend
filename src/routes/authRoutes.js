const express = require('express');
const authController = require('../controllers/authController');
const { authLimiter, otpLimiter } = require('../middlewares/rateLimiterMW');
const validateSchema = require('../middlewares/schemaValidatorMW');
const authMW = require('../middlewares/authMW');
const authRegisterValidate = require('../utils/authRegisterValidate');
const authLoginValidate = require('../utils/authLoginValidate');

const router = express.Router();

router.post('/register', authLimiter, validateSchema(authRegisterValidate), authController.register);
router.post('/login', authLimiter, validateSchema(authLoginValidate), authController.login);
router.get('/me', authMW, authController.getMe);
router.post('/refresh-token', authLimiter, authController.refreshToken);
router.post('/logout', authMW, authController.logout);
router.post('/forgot-password', authLimiter, authController.forgotPassword);
router.post('/reset-password', authLimiter, authController.resetPassword);

const otpPayloadSchema = {
	body: {
		type: 'object',
		required: ['email'],
		properties: {
			email: { type: 'string', format: 'email' },
			purpose: { type: 'string', enum: ['verify', 'reset'] },
		},
		additionalProperties: false,
	},
};

const verifyOtpPayloadSchema = {
	body: {
		type: 'object',
		required: ['email', 'otp'],
		properties: {
			email: { type: 'string', format: 'email' },
			otp: { type: 'string', minLength: 4, maxLength: 12 },
			purpose: { type: 'string', enum: ['verify', 'reset'] },
		},
		additionalProperties: false,
	},
};

router.post('/send-otp', otpLimiter, validateSchema(otpPayloadSchema), authController.sendOTP);
router.post('/verify-otp', otpLimiter, validateSchema(verifyOtpPayloadSchema), authController.verifyOTP);
router.post('/resend-otp', otpLimiter, validateSchema(otpPayloadSchema), authController.resendOTP);

module.exports = router;
