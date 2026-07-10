const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ARTIFACT_DIR = path.join(ROOT, "artifacts");
const rootPackage = require(path.join(ROOT, "package.json"));
const backendPackage = require(path.join(ROOT, "backend/package.json"));
const frontendPackage = require(path.join(ROOT, "frontend/package.json"));
const releaseLabel = rootPackage.version;

fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const summary = {
  generatedAt: new Date().toISOString(),
  version: rootPackage.version,
  releaseLabel,
  packages: {
    root: rootPackage.version,
    backend: backendPackage.version,
    frontend: frontendPackage.version,
  },
  qualityGates: [
    "backend lint",
    "backend build syntax verification",
    "backend tests",
    "frontend lint",
    "frontend Vite build",
    "production readiness check",
    "workflow verification",
    "artifact validation",
  ],
  releaseArtifacts: [
    "release-summary.json",
    "release-notes.md",
    "known-issues.md",
    "upgrade-notes.md",
    "production-checklist.md",
    "enterprise-certification.json",
    "enterprise-certification.md",
    "technical-debt.md",
    "migration-notes.md",
    "installation-guide.md",
  ],
};

fs.writeFileSync(path.join(ARTIFACT_DIR, "release-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
fs.writeFileSync(
  path.join(ARTIFACT_DIR, "release-notes.md"),
  `# Parentheses Licence ${summary.releaseLabel}\n\nGenerated: ${summary.generatedAt}\n\n## Release Scope\n\nParentheses Licence ${summary.releaseLabel} is the production release artifact set for the SaaS licensing portal, backend API, WordPress plugin licensing/update contract, deployment documentation, and release engineering workflow.\n\n## Breaking Changes\n\nNone documented for 1.0.0.\n\n## Upgrade Notes\n\nSee artifacts/upgrade-notes.md.\n\n## Known Issues\n\nSee artifacts/known-issues.md.\n\n## Production Checklist\n\nSee artifacts/production-checklist.md.\n\n## Quality Gates\n\n${summary.qualityGates.map((gate) => `- ${gate}`).join("\n")}\n`
);
fs.writeFileSync(
  path.join(ARTIFACT_DIR, "known-issues.md"),
  `# Known Issues - Parentheses Licence ${summary.releaseLabel}\n\nGenerated: ${summary.generatedAt}\n\n- Local filesystem plugin ZIP storage requires persistent volume or external backup on ephemeral hosts.\n- Gateway refunds are recorded in-app, but issuing the external PSP/Stripe refund remains an operator action.\n- Frontend bundle currently emits a Vite chunk-size warning; build succeeds.\n- Frontend lint currently passes with React Compiler and hook dependency warnings.\n- Secret settings are env-managed until encrypted settings storage exists.\n`
);
fs.writeFileSync(
  path.join(ARTIFACT_DIR, "upgrade-notes.md"),
  `# Upgrade Notes - Parentheses Licence ${summary.releaseLabel}\n\nGenerated: ${summary.generatedAt}\n\n## Database\n\nNo explicit migration scripts are required for 1.0.0. Existing MongoDB collections remain compatible with the current Mongoose models.\n\n## Environment\n\nReview docs/ENVIRONMENT.md before upgrade. Prefer ENABLE_STRIPE and ENABLE_LOCAL_PSP over legacy alias flags.\n\n## Storage\n\nBack up uploaded plugin ZIPs before deployment or rollback, especially on ephemeral hosting.\n\n## Deployment\n\nDeploy backend first, confirm /live and /ready, then deploy frontend with VITE_API_URL pointing at the backend API.\n`
);
fs.writeFileSync(
  path.join(ARTIFACT_DIR, "production-checklist.md"),
  `# Production Checklist - Parentheses Licence ${summary.releaseLabel}\n\nGenerated: ${summary.generatedAt}\n\n- Confirm Railway backend variables match docs/ENVIRONMENT.md.\n- Confirm Vercel frontend VITE_API_URL points to https://api.blogpoint.net/api/v1.\n- Confirm MongoDB Atlas backups and restore permissions.\n- Confirm SMTP sender, app password, and reply-to mailbox.\n- Confirm CORS_ORIGIN includes https://app.blogpoint.net.\n- Confirm /live and /ready pass after backend deployment.\n- Confirm admin account exists and uses a strong password.\n- Confirm plugin ZIP storage is persistent or externally backed up.\n- Confirm WordPress activation, validation, update check, and secure download flows.\n- Confirm rollback plan and uploaded ZIP backup before release.\n`
);

console.log(`Release summary generated in ${path.relative(ROOT, ARTIFACT_DIR).replace(/\\/g, "/")}.`);
