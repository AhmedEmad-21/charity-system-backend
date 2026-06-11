const { v2: cloudinary } = require('cloudinary');
const config = require('./appConfig');

let configured = false;

const ensureCloudinaryConfig = () => {
  const required = [
    ['CLOUDINARY_CLOUD_NAME', config.cloudinary.cloudName],
    ['CLOUDINARY_API_KEY', config.cloudinary.apiKey],
    ['CLOUDINARY_API_SECRET', config.cloudinary.apiSecret],
  ];

  for (const [name, value] of required) {
    if (!value || String(value).trim() === '') {
      throw new Error(`Cloudinary configuration missing: ${name}`);
    }
  }
};

const initializeCloudinary = () => {
  if (configured) {
    return cloudinary;
  }

  ensureCloudinaryConfig();

  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
    secure: true,
  });

  configured = true;
  return cloudinary;
};

module.exports = {
  cloudinary,
  initializeCloudinary,
  ensureCloudinaryConfig,
};
