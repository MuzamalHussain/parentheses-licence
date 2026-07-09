const AIPromptTemplate = require("../../models/AIPromptTemplate");
const Audit = require("./AIAuditService");
const Permissions = require("./AIPermissionService");

async function savePrompt(organizationId, input = {}, context = {}) {
  await Permissions.assert(context.actor, organizationId, "ai.prompt.manage");
  const prompt = await AIPromptTemplate.findOneAndUpdate(
    { organizationId, key: input.key, version: input.version || "1.0.0" },
    {
      $set: {
        name: input.name || input.key,
        category: input.category || "general",
        type: input.type || "template",
        status: input.status || "draft",
        content: input.content,
        variables: input.variables || [],
        components: input.components || [],
        updatedBy: context.actor?._id,
      },
      $setOnInsert: { organizationId, key: input.key, version: input.version || "1.0.0" },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  await Audit.record("ai.prompt_updated", { ...context, organizationId, targetId: prompt._id, metadata: { key: prompt.key, version: prompt.version } });
  return prompt;
}

async function listPrompts(organizationId) {
  return AIPromptTemplate.find({ organizationId }).sort({ category: 1, key: 1, version: -1 }).lean();
}

module.exports = { listPrompts, savePrompt };
