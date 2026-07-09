import { useState } from "react";
import { Bot, Loader2, Send } from "lucide-react";
import { useOrganizations } from "../../hooks/useAccount";
import { useAdminAIAssistant, useAskAdminAIAssistant } from "../../hooks/useLicenses";

function Metric({ label, value }) {
  return (
    <div className="card p-4">
      <p className="text-xl font-bold text-gray-900">{Number(value || 0).toLocaleString()}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

export default function AdminAIAssistant() {
  const { data: organizations = [] } = useOrganizations();
  const [organizationId, setOrganizationId] = useState("");
  const activeOrgId = organizationId || organizations[0]?._id || "";
  const { data, isLoading } = useAdminAIAssistant(activeOrgId);
  const ask = useAskAdminAIAssistant();
  const [question, setQuestion] = useState("Which customers have license or payment issues?");

  const submit = () => {
    if (!question.trim() || !activeOrgId) return;
    ask.mutate({ organizationId: activeOrgId, question }, { onSuccess: () => setQuestion("") });
  };

  const latest = data?.history?.[0];
  const messages = latest?.messages || [];
  const stats = data?.stats || {};

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Assistant Center</h1>
          <p className="text-sm text-gray-500 mt-0.5">Admin assistant grounded in customers, licenses, orders, payments, downloads, and organizations</p>
        </div>
        <select className="input max-w-xs" value={activeOrgId} onChange={(event) => setOrganizationId(event.target.value)}>
          {organizations.map((org) => <option key={org._id} value={org._id}>{org.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Metric label="Conversations" value={stats.conversations} />
        <Metric label="Prompt Tokens" value={stats.totalPromptTokens} />
        <Metric label="Completion Tokens" value={stats.totalCompletionTokens} />
        <Metric label="Estimated Cost" value={(stats.totalEstimatedCost || 0).toFixed?.(4) || 0} />
      </div>

      <div className="grid xl:grid-cols-[1fr_20rem] gap-6">
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Bot className="w-5 h-5 text-gray-500" />
            <h2 className="font-semibold text-gray-900">Assistant</h2>
          </div>
          <div className="p-5 space-y-4 min-h-96">
            {isLoading && <Loader2 className="w-6 h-6 animate-spin text-brand-500" />}
            {messages.map((message) => (
              <div key={message._id || `${message.role}-${message.createdAt}`} className={`max-w-3xl ${message.role === "user" ? "ml-auto text-right" : ""}`}>
                <div className={`inline-block rounded-lg px-4 py-3 text-sm whitespace-pre-wrap ${message.role === "user" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-800"}`}>
                  {message.content}
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-gray-100 flex gap-2">
            <input className="input" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => event.key === "Enter" && submit()} />
            <button className="btn-primary" disabled={ask.isPending || !question.trim()} onClick={submit}>
              {ask.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Top Questions</h2>
            <div className="space-y-2">
              {(stats.topQuestions || []).map((item) => <p key={item} className="text-sm text-gray-600">{item}</p>)}
            </div>
          </div>
          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Recent Conversations</h2>
            <div className="space-y-2">
              {(data?.history || []).slice(0, 8).map((conversation) => (
                <div key={conversation._id} className="text-sm">
                  <p className="font-medium text-gray-800 truncate">{conversation.title}</p>
                  <p className="text-xs text-gray-500">{conversation.lastProviderId || "provider pending"} · {conversation.lastModelId || "model pending"}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
