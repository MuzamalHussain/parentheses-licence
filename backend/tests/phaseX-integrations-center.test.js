const assert = require("assert");

process.env.NODE_ENV = "test";
process.env.APP_ENCRYPTION_KEY = "phase_x_integration_secret_key_32_chars_minimum";

const SecretService = require("../src/services/security/IntegrationSecretService");
const catalog = require("../src/services/integrations/ProviderCatalog");
const registry = require("../src/services/integrations/IntegrationRegistry");

function testAuthenticatedEncryption() {
  const encrypted = SecretService.encrypt("sk_live_sensitive_value");
  assert.strictEqual(encrypted.algorithm, "aes-256-gcm");
  assert.ok(!JSON.stringify(encrypted).includes("sk_live_sensitive_value"));
  assert.strictEqual(SecretService.decrypt(encrypted), "sk_live_sensitive_value");
  assert.throws(() => SecretService.decrypt({ ...encrypted, ciphertext: `${encrypted.ciphertext.slice(0, -2)}AA` }));
}

function testCompleteCatalogAndSecretMetadata() {
  for (const category of ["General", "Payments", "Email", "AI Providers", "Storage", "SMS", "Webhooks", "Developer", "Security"]) {
    assert.ok(catalog.CATEGORIES.includes(category));
  }
  for (const id of ["stripe", "wise", "jazzcash", "easypaisa", "smtp", "mailtrap", "resend", "sendgrid", "amazon_ses", "openai", "anthropic", "gemini", "groq", "openrouter", "azure_openai", "storage_local", "storage_s3", "storage_r2", "storage_azure_blob", "storage_gcs", "twilio", "vonage", "global_webhooks", "github", "gitlab", "bitbucket"]) {
    assert.ok(registry.get(id));
  }
  assert.ok(catalog.get("stripe").fields.find((field) => field.key === "secretKey").secret);
}

testAuthenticatedEncryption();
testCompleteCatalogAndSecretMetadata();
console.log("PASS phase X integrations center security and provider catalog");
