const multer = require("multer");
const config = require("../config/appConfig");
const { uploadVettingDocument } = require("../services/documentUploadService");

const MAX_FILE_SIZE_BYTES = config.uploads.maxFileSizeBytes;
const ALLOWED_MIME_TYPES = new Set(config.uploads.allowedFileTypes);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      const error = new Error(
        `Unsupported file type. Allowed types are: ${Array.from(ALLOWED_MIME_TYPES).join(", ")}`,
      );
      error.status = 400;
      cb(error);
      return;
    }

    cb(null, true);
  },
});

const toNumberIfDefined = (value) => {
  if (value === undefined || value === null || value === "") {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
};

module.exports = (req, res, next) => {
  upload.fields([
    { name: "documents", maxCount: 10 },
    { name: "document", maxCount: 1 },
  ])(req, res, async (error) => {
    if (error) {
      return next(error);
    }

    try {
      const uploadedFiles = [
        ...(req.files?.documents || []),
        ...(req.files?.document || []),
        ...(req.file ? [req.file] : []),
      ];

      req.body = {
        ...req.body,
        monthlyIncome: toNumberIfDefined(req.body?.monthlyIncome),
        familyMembers: toNumberIfDefined(req.body?.familyMembers),
      };

      if (uploadedFiles.length > 0) {
        const uploadResults = await Promise.all(
          uploadedFiles.map((file) =>
            uploadVettingDocument(file, {
              recipientUserID:
                req.user?.id ||
                req.user?._id ||
                req.user?.userId ||
                "unknown-user",
            }),
          ),
        );

        req.body.documentsURL = uploadResults.map((result) => result.url);
      }

      return next();
    } catch (uploadError) {
      return next(uploadError);
    }
  });
};
