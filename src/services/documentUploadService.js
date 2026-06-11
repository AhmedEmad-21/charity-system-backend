const config = require('../config/appConfig');
const { initializeCloudinary } = require('../config/cloudinary');
const { uploadImage } = require('./uploadService');
const { BadRequestError, NotFoundError } = require('../errors/appErrors');

const hasCloudinaryConfig = () => (
	Boolean(config.cloudinary.cloudName)
	&& Boolean(config.cloudinary.apiKey)
	&& Boolean(config.cloudinary.apiSecret)
);

const ensureCloudinaryConfigured = () => {
	if (!hasCloudinaryConfig()) {
		throw new BadRequestError('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.');
	}
};

const uploadVettingDocument = async (file, metadata = {}) => {
	initializeCloudinary();

	if (!file || !file.buffer) {
		throw new BadRequestError('No document file was provided for upload');
	}

	const safeUserId = String(metadata.recipientUserID || 'unknown-user').replace(/[^a-zA-Z0-9_-]/g, '');
	const baseName = String(file.originalname || 'document').replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  const publicId = `${safeUserId}_${Date.now()}_${baseName}`;

	const result = await uploadImage(file, {
	folder: config.cloudinary.vettingFolder,
	publicIdPrefix: publicId,
  });

	return {
		url: result.url,
		publicId: result.publicId,
		resourceType: 'image',
		bytes: result.bytes,
		format: result.format,
	};
};

module.exports = {
	hasCloudinaryConfig,
	uploadVettingDocument,
};
