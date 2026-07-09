import { useState } from "react";
import { Bot, Loader2, Send } from "lucide-react";
import { useAIAssistantHistory, useAskAIAssistant } from "../../hooks/useLicenses";

const suggestions = [
  "Why can I not activate my site?",
  "How do I download the latest version?",
  "Is my license eligible for renewal?",
  "What is the status of my latest order?",
];

export default function AIAssistantPage() {
  const { data: history = [], isLoading } = useAIAssistantHistory();
  const ask = useAskAIAssistant();
  const [question, setQuestion] = useState("");
  const latest = history[0];
  const messages = latest?.messages || [];

  const submit = (text = question) => {
    if (!text.trim()) return;
    ask.mutate({ question: text }, { onSuccess: () => setQuestion("") });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">AI Assistant</h1>
        <p className="text-sm text-gray-500 mt-0.5">Licensing and support answers grounded in your account data</p>
      </div>

      <div className="grid xl:grid-cols-[1fr_18rem] gap-6">
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Bot className="w-5 h-5 text-gray-500" />
            <h2 className="font-semibold text-gray-900">Conversation</h2>
          </div>
          <div className="p-5 space-y-4 min-h-96">
            {isLoading && <Loader2 className="w-6 h-6 animate-spin text-brand-500" />}
            {!isLoading && messages.length === 0 && <p className="text-sm text-gray-500">Ask about licenses, activations, downloads, renewals, payments, orders, account, or versions.</p>}
            {messages.map((message) => (
              <div key={message._id || `${message.role}-${message.createdAt}`} className={`max-w-3xl ${message.role === "user" ? "ml-auto text-right" : ""}`}>
                <div className={`inline-block rounded-lg px-4 py-3 text-sm whitespace-pre-wrap ${message.role === "user" ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-800"}`}>
                  {message.content}
                </div>
                {message.suggestedActions?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {message.suggestedActions.map((item) => <span key={item} className="text-xs px-2 py-1 rounded bg-gray-50 text-gray-600">{item}</span>)}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-gray-100 flex gap-2">
            <input className="input" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => event.key === "Enter" && submit()} placeholder="Ask a licensing or support question" />
            <button className="btn-primary" disabled={ask.isPending || !question.trim()} onClick={() => submit()}>
              {ask.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Suggested Questions</h2>
            <div className="space-y-2">
              {suggestions.map((item) => (
                <button key={item} className="w-full text-left text-sm px-3 py-2 rounded border border-gray-100 hover:bg-gray-50" onClick={() => submit(item)}>
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 mb-3">History</h2>
            <div className="space-y-2">
              {history.slice(0, 8).map((conversation) => (
                <div key={conversation._id} className="text-sm">
                  <p className="font-medium text-gray-800 truncate">{conversation.title}</p>
                  <p className="text-xs text-gray-500">{conversation.category}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
