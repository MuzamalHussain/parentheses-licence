const templates = [
  { key: "license_renewal", category: "renewals", title: "License Renewal", eventName: "LicenseExpiring", outcome: "Customer receives renewal follow-up and license remains recoverable." },
  { key: "payment_recovery", category: "payments", title: "Payment Recovery", eventName: "PaymentFailed", outcome: "Customer receives payment recovery follow-up." },
  { key: "welcome_sequence", category: "notifications", title: "Welcome Sequence", eventName: "UserRegistered", outcome: "New customer receives onboarding communication." },
  { key: "version_release", category: "releases", title: "Version Release", eventName: "VersionReleased", outcome: "Eligible customers are notified about a release." },
  { key: "security_alert", category: "security", title: "Security Alert", eventName: "SecurityAlertCreated", outcome: "Administrators are alerted for review." },
  { key: "customer_follow_up", category: "support", title: "Customer Follow-up", eventName: "SupportTicketUpdated", outcome: "Support team receives follow-up workflow context." },
  { key: "organization_invitation", category: "organizations", title: "Organization Invitation", eventName: "OrganizationInvitationSuggested", outcome: "Organization owner receives invitation recommendation context." },
  { key: "api_key_rotation_reminder", category: "developer_platform", title: "API Key Rotation Reminder", eventName: "ApiKeyRotationRecommended", outcome: "Developer or admin receives API key rotation reminder." },
];

function list() {
  return templates;
}

function get(key) {
  return templates.find((template) => template.key === key) || null;
}

module.exports = { list, get };
