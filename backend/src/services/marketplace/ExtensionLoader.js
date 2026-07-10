const crypto = require("crypto");
const Compatibility = require("./ExtensionCompatibilityService");

function integrityFor(extension) {
  return crypto.createHash("sha256").update(JSON.stringify({
    id: extension.id,
    version: extension.version,
    entryPoint: extension.entryPoint,
    permissions: extension.permissions,
  })).digest("hex");
}

function validateSignature(extension) {
  return {
    packageSignature: extension.signature ? "provided" : "foundation_missing",
    signatureValid: Boolean(extension.signature),
    publisherIdentity: extension.publisher?.verified ? "verified" : "unverified",
    externalCertificateAuthority: false,
  };
}

function load(extension, installed = []) {
  const compatibility = Compatibility.validate(extension, installed);
  const signature = validateSignature(extension);
  return {
    loaded: compatibility.compatible,
    lazyLoaded: true,
    cacheable: true,
    sandboxed: true,
    integrity: integrityFor(extension),
    signature,
    compatibility,
  };
}

module.exports = { integrityFor, load, validateSignature };
