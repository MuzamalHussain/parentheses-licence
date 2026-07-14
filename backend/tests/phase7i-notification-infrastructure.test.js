const assert = require("assert");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = "phase7i_test_access_secret_with_enough_entropy";
process.env.JWT_REFRESH_SECRET = "phase7i_test_refresh_secret_with_enough_entropy";
process.env.SMTP_HOST = "smtp.example.test";
process.env.SMTP_PORT = "587";
process.env.SMTP_USER = "mailer@example.test";
process.env.SMTP_PASS = "smtp_secret_for_test";
process.env.SMTP_FROM = "Parentheses <no-reply@example.test>";
process.env.SMTP_REPLY_TO = "support@example.test";
process.env.EMAIL_PROVIDER = "smtp";
process.env.EMAIL_RETRY_COUNT = "2";
process.env.EMAIL_TIMEOUT_MS = "1000";

const root = path.resolve(__dirname, "..");

function clearModule(relativePath) {
  const resolved = require.resolve(path.join(root, relativePath));
  delete require.cache[resolved];
  return resolved;
}

function loadService() {
  for (const relativePath of [
    "src/services/notificationService.js",
    "src/services/notifications/queue.js",
    "src/services/notifications/templates.js",
    "src/config/env.js",
  ]) {
    clearModule(relativePath);
  }
  return {
    service: require(path.join(root, "src/services/notificationService.js")),
    queue: require(path.join(root, "src/services/notifications/queue.js")),
    templates: require(path.join(root, "src/services/notifications/templates.js")),
  };
}

function createLogger() {
  const logs = [];
  return {
    logs,
    log: (...args) => logs.push({ level: "log", args }),
    warn: (...args) => logs.push({ level: "warn", args }),
  };
}

async function testVerificationEmailDispatchesThroughProvider() {
  const { service, queue } = loadService();
  const sent = [];
  service.setNotificationProviderForTests({
    name: "test-provider",
    async send(message) {
      sent.push(message);
      return { messageId: "msg_1" };
    },
  });

  const result = await service.sendVerificationEmail({
    to: "ada@example.test",
    name: "Ada",
    url: "https://app.example.test/verify?token=secret",
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.provider, "test-provider");
  assert.strictEqual(sent.length, 1);
  assert.match(sent[0].subject, /Verify your email/);
  assert.match(sent[0].html, /Verify Email/);
  assert.strictEqual(sent[0].replyTo, "support@example.test");
  service.resetNotificationServiceForTests();
  queue.resetNotificationQueueForTests();
}

async function testPasswordResetEmailTemplateRenders() {
  const { templates } = loadService();
  const rendered = templates.renderTemplate("passwordReset", {
    name: "Grace",
    url: "https://app.example.test/reset?token=secret",
  });

  assert.match(rendered.subject, /Reset your password/);
  assert.match(rendered.html, /Grace/);
  assert.match(rendered.html, /Reset Password/);
}

async function testWelcomeEmailSupported() {
  const { service } = loadService();
  const sent = [];
  service.setNotificationProviderForTests({
    name: "test-provider",
    async send(message) {
      sent.push(message);
      return { messageId: "welcome_1" };
    },
  });

  const result = await service.sendWelcomeEmail({ to: "ada@example.test", name: "Ada" });
  assert.strictEqual(result.success, true);
  assert.match(sent[0].subject, /Welcome/);
  service.resetNotificationServiceForTests();
}

async function testRetryLogicEventuallySucceeds() {
  const { service } = loadService();
  let attempts = 0;
  service.setNotificationProviderForTests({
    name: "retry-provider",
    async send() {
      attempts += 1;
      if (attempts < 3) throw new Error("temporary smtp failure");
      return { messageId: "msg_retry" };
    },
  });

  const result = await service.notify("adminAlert", {
    to: "ops@example.test",
    payload: { title: "Retry", message: "retry test" },
    queue: false,
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.attempts, 3);
  service.resetNotificationServiceForTests();
}

async function testFailedSmtpDoesNotThrow() {
  const { service } = loadService();
  service.setNotificationProviderForTests({
    name: "failed-provider",
    async send() {
      throw new Error("smtp unavailable");
    },
  });

  const result = await service.sendPasswordResetEmail({
    to: "ada@example.test",
    name: "Ada",
    url: "https://app.example.test/reset",
  });

  assert.strictEqual(result.success, false);
  assert.match(result.error, /smtp unavailable/);
  service.resetNotificationServiceForTests();
}

async function testQueueDispatch() {
  const { service, queue } = loadService();
  let enqueued = 0;
  queue.setNotificationQueueForTests({
    name: "test-queue",
    async enqueue(job) {
      enqueued += 1;
      return job();
    },
  });
  service.setNotificationProviderForTests({
    name: "queued-provider",
    async send() {
      return { messageId: "queued_1" };
    },
  });

  const result = await service.notify("adminAlert", {
    to: "ops@example.test",
    payload: { title: "Queue", message: "queue test" },
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(enqueued, 1);
  service.resetNotificationServiceForTests();
  queue.resetNotificationQueueForTests();
}

async function testHangingProviderReturnsWithinConfiguredTimeout() {
  const { service } = loadService();
  service.setNotificationProviderForTests({
    name: "hanging-provider",
    async send() {
      return new Promise(() => {});
    },
  });

  const startedAt = Date.now();
  const result = await service.sendVerificationEmail({
    to: "ada@example.test",
    name: "Ada",
    url: "https://app.example.test/verify",
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.errorCode, "EMAIL_SEND_TIMEOUT");
  assert.ok(Date.now() - startedAt < 1500);
  service.resetNotificationServiceForTests();
}

async function testLoggingOmitsSecretsAndTokens() {
  const { service } = loadService();
  const logger = createLogger();
  service.setNotificationLoggerForTests(logger);
  service.setNotificationProviderForTests({
    name: "logging-provider",
    async send() {
      return { messageId: "logged_1" };
    },
  });

  await service.sendLicensePurchasedEmail({
    to: "ada@example.test",
    name: "Ada",
    productName: "Parentheses",
    licenseKey: "SECRET-LICENSE-KEY",
  });

  const serialized = JSON.stringify(logger.logs);
  assert.match(serialized, /ad\*\*\*@example\.test/);
  assert.ok(!serialized.includes("SECRET-LICENSE-KEY"));
  assert.ok(!serialized.includes(process.env.SMTP_PASS));
  service.resetNotificationServiceForTests();
}

async function testProviderDiagnostics() {
  const { service } = loadService();
  service.setNotificationProviderForTests({
    name: "diagnostic-provider",
    async verify() {
      return { success: true, provider: "diagnostic-provider" };
    },
    async send() {
      return { messageId: "diag" };
    },
  });

  const result = await service.verifyEmailProvider();
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.provider, "diagnostic-provider");
  service.resetNotificationServiceForTests();
}

async function testSendTestEmail() {
  const { service } = loadService();
  const sent = [];
  service.setNotificationProviderForTests({
    name: "test-provider",
    async send(message) {
      sent.push(message);
      return { messageId: "test_email" };
    },
  });

  const result = await service.sendTestEmail("admin@example.test");
  assert.strictEqual(result.success, true);
  assert.match(sent[0].subject, /Admin alert/);
  service.resetNotificationServiceForTests();
}

async function run() {
  const tests = [
    testVerificationEmailDispatchesThroughProvider,
    testPasswordResetEmailTemplateRenders,
    testWelcomeEmailSupported,
    testRetryLogicEventuallySucceeds,
    testFailedSmtpDoesNotThrow,
    testQueueDispatch,
    testHangingProviderReturnsWithinConfiguredTimeout,
    testLoggingOmitsSecretsAndTokens,
    testProviderDiagnostics,
    testSendTestEmail,
  ];

  for (const test of tests) {
    await test();
    console.log(`PASS ${test.name}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
