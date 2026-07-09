const Knowledge = require("./AIKnowledgeResolver");
const ContextBuilder = require("./AIContextBuilder");
const Formatter = require("./AIResponseFormatter");
const PromptRegistry = require("../ai/PromptRegistry");

function estimateTokens(text = "") {
  return Math.max(1, Math.ceil(String(text || "").length / 4));
}

async function answer({ actor, organizationId, audience = "customer", question = "" } = {}, context = {}) {
  const category = Knowledge.detectCategory(question, audience);
  const platformContext = await ContextBuilder.buildContext({ actor, organizationId, audience, question });
  const articles = Knowledge.articlesFor(category);
  const prompt = [
    "System: Answer only from the supplied Parentheses Licence context.",
    `Audience: ${audience}`,
    `Category: ${category}`,
    `Question: ${question}`,
    `Context summary:\n${platformContext.summary}`,
    `Knowledge:\n${articles.map((article) => `${article.title}: ${article.body}`).join("\n")}`,
  ].join("\n\n");
  const formatted = Formatter.formatAnswer({ question, category, context: platformContext, articles });
  const promptTokens = estimateTokens(prompt);
  const completionTokens = estimateTokens(formatted.answer);
  return {
    category,
    prompt,
    promptKey: `assistant.${category}`,
    context: platformContext,
    contextSummary: platformContext.summary,
    response: formatted.answer,
    suggestedActions: formatted.suggestedActions,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

async function ensureDefaultPrompts(organizationId, context = {}) {
  const defaults = [
    { key: "assistant.license", name: "Licensing Assistant", category: "licensing", type: "system", content: "Answer licensing questions using customer license context only.", status: "active" },
    { key: "assistant.support", name: "Support Assistant", category: "support", type: "system", content: "Help customers understand account, order, download, and support context.", status: "active" },
  ];
  const saved = [];
  for (const prompt of defaults) {
    saved.push(await PromptRegistry.savePrompt(organizationId, prompt, context).catch(() => null));
  }
  return saved.filter(Boolean);
}

module.exports = { answer, ensureDefaultPrompts, estimateTokens };
