const SecretService = require("../security/IntegrationSecretService");
const { EncryptionFailed } = require("./errors");
class SettingsEncryptionProvider {
  encrypt(value) { try { return SecretService.encrypt(value); } catch (error) { throw new EncryptionFailed("Unable to encrypt setting value.", error); } }
  decrypt(value) { try { return SecretService.decrypt(value); } catch (error) { throw new EncryptionFailed("Unable to decrypt setting value.", error); } }
  rotateKey(payload, { decryptWith, encryptWith } = {}) { if (typeof decryptWith !== "function" || typeof encryptWith !== "function") throw new EncryptionFailed("Key rotation requires explicit old-key decrypt and new-key encrypt functions."); try { return encryptWith(decryptWith(payload)); } catch (error) { throw new EncryptionFailed("Unable to rotate encrypted setting.", error); } }
  mask(value) { if (value === undefined || value === null || value === "") return ""; const text = String(value); return text.length <= 4 ? "****" : `${text.slice(0, 2)}${"*".repeat(Math.min(8, text.length - 4))}${text.slice(-2)}`; }
  status() { return SecretService.encryptionStatus(); }
}
module.exports = SettingsEncryptionProvider;
