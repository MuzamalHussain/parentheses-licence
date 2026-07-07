const assert = require("assert");
const path = require("path");

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parentheses_test";
process.env.JWT_ACCESS_SECRET = "phase10i_test_access_secret_with_enough_entropy";
process.env.JWT_REFRESH_SECRET = "phase10i_test_refresh_secret_with_enough_entropy";
process.env.SMTP_HOST = "smtp.example.test";
process.env.SMTP_PORT = "587";
process.env.SMTP_USER = "mailer@example.test";
process.env.SMTP_PASS = "smtp_secret_for_test";
process.env.SMTP_FROM = "Parentheses <no-reply@example.test>";
process.env.SMTP_REPLY_TO = "support@example.test";
process.env.EMAIL_PROVIDER = "smtp";
process.env.EMAIL_RETRY_COUNT = "0";

const root = path.resolve(__dirname, "..");

function clearModule(relativePath) {
  const resolved = require.resolve(path.join(root, relativePath));
  delete require.cache[resolved];
  return resolved;
}

function loadCenter(store = {}) {
  store.sent = store.sent || [];
  store.auditLogs = store.auditLogs || [];
  store.inApp = store.inApp || [];
  store.preferences = store.preferences || {};

  for (const relativePath of [
    "src/services/NotificationManager.js",
    "src/services/notificationService.js",
    "src/services/notifications/NotificationRegistry.js",
    "src/services/notifications/EmailNotificationProvider.js",
    "src/services/notifications/InAppNotificationProvider.js",
    "src/services/notifications/NotificationTemplateService.js",
    "src/services/notifications/NotificationPreferenceService.js",
    "src/models/InAppNotification.js",
    "src/models/NotificationPreference.js",
    "src/models/NotificationTemplate.js",
    "src/utils/auditLog.js",
  ]) clearModule(relativePath);

  const mappings = [
    ["src/models/InAppNotification.js", {
      async create(doc) {
        const created = { _id: `inapp_${store.inApp.length + 1}`, ...doc };
        store.inApp.push(created);
        return created;
      },
    }],
    ["src/models/NotificationPreference.js", {
      findOne(filter) {
        return { lean: async () => store.preferences[filter.userId] || null };
      },
      async create(doc) {
        store.preferences[doc.userId] = {
          productUpdates: true,
          renewalReminders: true,
          marketingEmails: false,
          securityAlerts: true,
          supportNotifications: true,
          ...doc,
        };
        return { toObject: () => store.preferences[doc.userId] };
      },
      async findOneAndUpdate(filter, update) {
        store.preferences[filter.userId] = { ...(store.preferences[filter.userId] || { userId: filter.userId }), ...(update.$set || {}) };
        return store.preferences[filter.userId];
      },
    }],
    ["src/models/NotificationTemplate.js", {
      findOne() {
        return { lean: async () => null };
      },
      async findOneAndUpdate(filter, update) {
        return { _id: "template_1", ...filter, ...update.$set };
      },
    }],
    ["src/utils/auditLog.js", { writeAuditLog: async (entry) => store.auditLogs.push(entry) }],
  ];

  for (const [relativePath, exports] of mappings) {
    const resolved = clearModule(relativePath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
  }

  const manager = require(path.join(root, "src/services/NotificationManager.js"));
  manager.setNotificationProviderForTests({
    name: "test-email",
    async send(message) {
      store.sent.push(message);
      return { messageId: `email_${store.sent.length}` };
    },
    async verify() {
      return { success: true, provider: "test-email" };
    },
  });
  return {
    manager,
    service: require(path.join(root, "src/services/notificationService.js")),
    templates: require(path.join(root, "src/services/notifications/NotificationTemplateService.js")),
    preferences: require(path.join(root, "src/services/notifications/NotificationPreferenceService.js")),
    store,
  };
}

async function testEmailVerificationUsesNotificationManager() {
  const { service, store } = loadCenter();
  const result = await service.sendVerificationEmail({ to: "ada@example.test", name: "Ada", url: "https://app.test/verify" });
  assert.strictEqual(result.success, true);
  assert.strictEqual(store.sent.length, 1);
  assert.match(store.sent[0].subject, /Verify your email/);
  assert.ok(store.auditLogs.some((entry) => entry.action === "notification.sent"));
}

async function testPasswordResetAndLicenseNotificationTemplates() {
  const { service, store } = loadCenter();
  await service.sendPasswordResetEmail({ to: "ada@example.test", name: "Ada", url: "https://app.test/reset" });
  await service.notify("licenseCreated", {
    to: "ada@example.test",
    payload: { product_name: "Parentheses", license_key: "LIC-123" },
  });
  assert.match(store.sent[0].subject, /Reset your password/);
  assert.match(store.sent[1].text, /LIC-123/);
}

async function testPaymentAndDownloadNotifications() {
  const { service, store } = loadCenter();
  await service.notify("orderPaid", { to: "ada@example.test", payload: { customer_name: "Ada", product_name: "Parentheses", order_number: "ORD-1" } });
  await service.notify("downloadReady", { to: "ada@example.test", payload: { customer_name: "Ada", product_name: "Parentheses", version: "2.0.0", download_url: "https://dl.test" } });
  assert.match(store.sent[0].subject, /Payment received/);
  assert.match(store.sent[1].subject, /available|Download/i);
}

async function testInAppNotificationProvider() {
  const { manager, store } = loadCenter();
  const result = await manager.notify("newVersionAvailable", {
    userId: "507f1f77bcf86cd799439901",
    payload: { product_name: "Parentheses", version: "2.1.0" },
    channels: ["in_app"],
  });
  assert.strictEqual(result.success, true);
  assert.strictEqual(store.inApp.length, 1);
  assert.match(store.inApp[0].title, /New version/i);
}

async function testPreferencesBlockOptionalNotifications() {
  const { manager, store } = loadCenter({
    preferences: {
      "507f1f77bcf86cd799439902": {
        userId: "507f1f77bcf86cd799439902",
        productUpdates: false,
        renewalReminders: true,
        marketingEmails: false,
        securityAlerts: true,
        supportNotifications: true,
      },
    },
  });
  const result = await manager.notify("newVersionAvailable", {
    userId: "507f1f77bcf86cd799439902",
    to: "ada@example.test",
    payload: { product_name: "Parentheses" },
  });
  assert.strictEqual(result.skipped, true);
  assert.strictEqual(result.reason, "preference_disabled");
  assert.strictEqual(store.sent.length, 0);
}

async function testTemplateRenderingAndHeaderSanitization() {
  const { templates } = loadCenter();
  const rendered = await templates.previewTemplate({
    subject: "Hello\r\nBcc: bad@example.test {{customer_name}}",
    htmlBody: "<p>{{customer_name}}</p>",
    textBody: "Hi {{customer_name}}",
    payload: { customer_name: "<Ada>" },
  });
  assert.match(rendered.html, /&lt;Ada&gt;/);
  assert.match(templates.sanitizeHeader(rendered.subject), /Hello Bcc/);
}

async function testPreferenceUpdatesAndPermissions() {
  const { preferences } = loadCenter();
  const updated = await preferences.updatePreferences("507f1f77bcf86cd799439903", { marketingEmails: true, securityAlerts: false });
  assert.strictEqual(updated.marketingEmails, true);
  assert.strictEqual(updated.securityAlerts, false);

  const { requireRole } = require(path.join(root, "src/middleware/auth.js"));
  let error = null;
  requireRole("admin")({ user: { role: "support" } }, {}, (err) => { error = err; });
  assert.strictEqual(error.statusCode, 403);
}

function testProviderRegistryIncludesFutureChannels() {
  const { manager } = loadCenter();
  const channels = manager.listProviders().map((provider) => provider.channel);
  assert.ok(channels.includes("email"));
  assert.ok(channels.includes("in_app"));
  assert.ok(channels.includes("sms"));
  assert.ok(channels.includes("whatsapp"));
  assert.ok(channels.includes("push"));
  assert.ok(channels.includes("slack"));
  assert.ok(channels.includes("discord"));
}

async function run() {
  const tests = [
    testEmailVerificationUsesNotificationManager,
    testPasswordResetAndLicenseNotificationTemplates,
    testPaymentAndDownloadNotifications,
    testInAppNotificationProvider,
    testPreferencesBlockOptionalNotifications,
    testTemplateRenderingAndHeaderSanitization,
    testPreferenceUpdatesAndPermissions,
    testProviderRegistryIncludesFutureChannels,
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
