const config = require('../config/appConfig');
const { initializeCloudinary } = require('../config/cloudinary');
const { BadRequestError } = require('../errors/appErrors');

const sanitizePublicIdPart = (value, fallback = 'file') =>
  String(value || fallback)
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 50);

const validateUploadInput = (file) => {
  if (!file || !file.buffer) {
    throw new BadRequestError('No file was provided for upload');
  }

  if (file.size > config.uploads.maxFileSizeBytes) {
    throw new BadRequestError(
      `File exceeds maximum size (${config.uploads.maxFileSizeRaw})`
    );
  }

  const allowed = new Set(config.uploads.allowedFileTypes);
  if (allowed.size > 0 && !allowed.has(file.mimetype)) {
    throw new BadRequestError(
      `Unsupported file type. Allowed: ${config.uploads.allowedFileTypes.join(', ')}`
    );
  }
};

const uploadBuffer = (fileBuffer, options) => {
  const cloudinary = initializeCloudinary();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    });

    stream.end(fileBuffer);
  });
};

const uploadImage = async (file, options = {}) => {
  validateUploadInput(file);

  const folder = options.folder || config.cloudinary.itemFolder;
  const safePrefix = sanitizePublicIdPart(options.publicIdPrefix || 'image');
  const safeName = sanitizePublicIdPart(file.originalname || 'file');
  const publicId = `${safePrefix}_${Date.now()}_${safeName}`;

  const result = await uploadBuffer(file.buffer, {
    folder,
    public_id: publicId,
    resource_type: 'image',
    overwrite: false,
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
    bytes: result.bytes,
    format: result.format,
    width: result.width,
    height: result.height,
  };
};

const deleteImage = async (publicId) => {
  if (!publicId) {
    return { deleted: false, reason: 'missing publicId' };
  }

  const cloudinary = initializeCloudinary();
  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: 'image',
    invalidate: true,
  });

  return {
    deleted: result?.result === 'ok',
    result,
  };
};

const updateImage = async ({ previousPublicId, file, options = {} }) => {
  const uploaded = await uploadImage(file, options);

  if (previousPublicId) {
    await deleteImage(previousPublicId);
  }

  return uploaded;
};

module.exports = {
  validateUploadInput,
  uploadImage,
  deleteImage,
  updateImage,
};
