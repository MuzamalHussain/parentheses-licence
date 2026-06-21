const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// Storage root — NOT under any publicly served static path.
const STORAGE_ROOT = path.join(__dirname, "..", "..", "storage", "plugin-versions");

if (!fs.existsSync(STORAGE_ROOT)) {
  fs.mkdirSync(STORAGE_ROOT, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, STORAGE_ROOT),
  filename: (req, file, cb) => {
    // Random filename on disk — never trust/use the original filename for storage,
    // it's kept separately in originalFileName for display purposes only.
    const randomName = crypto.randomBytes(16).toString("hex");
    cb(null, `${randomName}.zip`);
  },
});

const fileFilter = (req, file, cb) => {
  const isZip =
    file.mimetype === "application/zip" ||
    file.mimetype === "application/x-zip-compressed" ||
    path.extname(file.originalname).toLowerCase() === ".zip";

  if (!isZip) return cb(new Error("Only .zip files are allowed."), false);
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB cap — plenty for a WP plugin
});

module.exports = { upload, STORAGE_ROOT };
