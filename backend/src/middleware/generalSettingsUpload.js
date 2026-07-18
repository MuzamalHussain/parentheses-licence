const multer = require("multer");
const path = require("path");
const { AppError } = require("../utils/errorHandler");

const TYPES = {
  logo: { extensions: [".png", ".jpg", ".jpeg", ".webp"], mime: ["image/png", "image/jpeg", "image/webp"], maxBytes: 2 * 1024 * 1024 },
  favicon: { extensions: [".png", ".ico"], mime: ["image/png", "image/x-icon", "image/vnd.microsoft.icon"], maxBytes: 512 * 1024 },
};

function imageUpload(kind) {
  const rules = TYPES[kind];
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: rules.maxBytes, files: 1 }, fileFilter(req, file, callback) { const extension = path.extname(file.originalname).toLowerCase(); if (!rules.extensions.includes(extension) || !rules.mime.includes(file.mimetype)) return callback(new AppError(`Invalid ${kind} file type.`, 422)); callback(null, true); } }).single("file");
  return (req, res, next) => upload(req, res, (error) => { if (error?.code === "LIMIT_FILE_SIZE") return next(new AppError(`${kind === "logo" ? "Logo" : "Favicon"} file is too large.`, 413)); if (error) return next(error); if (!req.file) return next(new AppError("An image file is required.", 422)); next(); });
}

function hasValidSignature(kind, file) {
  const bytes = file.buffer;
  const png = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp = bytes.length >= 12 && bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
  const ico = bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0;
  return kind === "favicon" ? png || ico : png || jpeg || webp;
}

module.exports = { imageUpload, hasValidSignature, TYPES };
