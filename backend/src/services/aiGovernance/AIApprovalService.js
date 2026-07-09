const AIPromptTemplate = require("../../models/AIPromptTemplate");
const AIPromptApproval = require("../../models/AIPromptApproval");
const PromptRegistry = require("../ai/PromptRegistry");
const Policy = require("./AIPolicyEngine");
const Audit = require("../ai/AIAuditService");
const Permissions = require("../ai/AIPermissionService");

function mapPromptStatus(status) {
  if (["approved", "production"].includes(status)) return "active";
  if (status === "archived") return "archived";
  return "draft";
}

async function submitPrompt({ actor, organizationId, input = {} } = {}, context = {}) {
  await Permissions.assert(actor, organizationId, "ai.prompt.manage");
  const validation = Policy.validatePrompt(input.content || "");
  if (!validation.valid) {
    const err = new Error(`Prompt failed governance validation: ${validation.issues.join(", ")}`);
    err.statusCode = 422;
    throw err;
  }
  const prompt = await PromptRegistry.savePrompt(organizationId, { ...input, status: mapPromptStatus(input.governanceStatus || "draft") }, { ...context, actor });
  const approval = await AIPromptApproval.findOneAndUpdate(
    { organizationId, key: prompt.key, version: prompt.version },
    {
      $set: {
        promptId: prompt._id,
        status: input.governanceStatus || "draft",
        requestedBy: actor?._id,
        notes: input.notes || "",
      },
      $setOnInsert: { organizationId, key: prompt.key, version: prompt.version },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  await Audit.record("ai.prompt_governance_submitted", { ...context, actor, organizationId, targetId: prompt._id, metadata: { key: prompt.key, version: prompt.version, status: approval.status } });
  return { prompt, approval, validation };
}

async function transitionPrompt({ actor, organizationId, key, version, status, notes = "" } = {}, context = {}) {
  await Permissions.assert(actor, organizationId, "ai.prompt.manage");
  const prompt = await AIPromptTemplate.findOne({ organizationId, key, version });
  if (!prompt) {
    const err = new Error("Prompt not found.");
    err.statusCode = 404;
    throw err;
  }
  prompt.status = mapPromptStatus(status);
  prompt.updatedBy = actor?._id;
  await prompt.save();
  const approval = await AIPromptApproval.findOneAndUpdate(
    { organizationId, key, version },
    { $set: { promptId: prompt._id, status, reviewedBy: actor?._id, reviewedAt: new Date(), notes }, $setOnInsert: { organizationId, key, version } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  await Audit.record("ai.prompt_governance_changed", { ...context, actor, organizationId, targetId: prompt._id, metadata: { key, version, status } });
  return { prompt, approval };
}

async function rollbackPrompt({ actor, organizationId, key, fromVersion, toVersion } = {}, context = {}) {
  await transitionPrompt({ actor, organizationId, key, version: fromVersion, status: "archived", notes: `Rolled back to ${toVersion}` }, context);
  const result = await transitionPrompt({ actor, organizationId, key, version: toVersion, status: "production", notes: `Rollback target from ${fromVersion}` }, context);
  await AIPromptApproval.findOneAndUpdate({ organizationId, key, version: toVersion }, { $set: { rollbackFromVersion: fromVersion } });
  await Audit.record("ai.prompt_rollback", { ...context, actor, organizationId, targetId: result.prompt._id, metadata: { key, fromVersion, toVersion } });
  return result;
}

async function listApprovals(organizationId) {
  return AIPromptApproval.find({ organizationId }).sort({ updatedAt: -1 }).limit(100).lean();
}

module.exports = { listApprovals, rollbackPrompt, submitPrompt, transitionPrompt };
