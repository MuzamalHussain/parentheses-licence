const crypto = require("crypto");

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const generateRawToken = () => crypto.randomBytes(32).toString("hex");

// Compute SHA-256 checksum of a file on disk — for integrity verification.
function fileChecksum(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = require("fs").createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

module.exports = { hashToken, generateRawToken, fileChecksum };
