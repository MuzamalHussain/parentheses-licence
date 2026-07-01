const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { AppError } = require("../utils/errorHandler");
const { getConfig } = require("../config/env");

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads", "plugins");

// Ensure the upload directory exists (non-public — never served by static middleware)
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // Unique, unguessable filename — actual ZIP is never exposed at a public URL anyway
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}.zip`;
    cb(null, unique);
  },
});

const fileFilter = (req, file, cb) => {
  const isZip =
    file.mimetype === "application/zip" ||
    file.mimetype === "application/x-zip-compressed" ||
    file.originalname.toLowerCase().endsWith(".zip");
  if (!isZip) return cb(new AppError("Only .zip files are allowed.", 422));
  cb(null, true);
};

const uploadPluginZip = multer({
  storage,
  fileFilter,
  limits: { fileSize: getConfig().downloads.pluginZip.maxUploadBytes },
}).single("file");

// Wrap multer's callback style so multer errors flow through our error handler
const handleUpload = (req, res, next) => {
  uploadPluginZip(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        const maxMb = Math.round(getConfig().downloads.pluginZip.maxUploadBytes / 1024 / 1024);
        return next(new AppError(`Archive too large. Maximum ZIP size is ${maxMb}MB.`, 413));
      }
      return next(new AppError(err.message, 400));
    }
    if (err) return next(err);
    next();
  });
};

module.exports = { handleUpload, UPLOAD_DIR };
