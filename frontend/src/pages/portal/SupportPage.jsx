import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { HeadphonesIcon, Plus, X, Loader2, Send, ArrowLeft } from "lucide-react";
import { Button, Input, FormField, Alert } from "../../components/ui";
import StatusBadge from "../../components/ui/StatusBadge";
import Pagination from "../../components/ui/Pagination";
import { useMyTickets, useMyTicket, useCreateTicket, useReplyToTicket } from "../../hooks/useSupport";

const ticketSchema = z.object({
  subject: z.string().min(3, "Subject is too short").max(200),
  message: z.string().min(1, "Message is required").max(5000),
});

function NewTicketModal({ onClose, onCreated }) {
  const { mutateAsync, isPending } = useCreateTicket();
  const [serverError, setServerError] = useState("");
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(ticketSchema) });

  const onSubmit = async (values) => {
    setServerError("");
    try {
      const res = await mutateAsync(values);
      onCreated(res.data._id);
    } catch (err) {
      setServerError(err.response?.data?.message || "Error creating ticket.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">New Support Ticket</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <Alert type="error" message={serverError} />
          <FormField label="Subject" error={errors.subject?.message} required>
            <Input {...register("subject")} placeholder="Brief summary of your issue" error={errors.subject} />
          </FormField>
          <FormField label="Message" error={errors.message?.message} required>
            <textarea {...register("message")} rows={5} className="input resize-none"
              placeholder="Describe what's happening in detail..." />
          </FormField>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={isPending} className="flex-1">Submit ticket</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TicketThread({ ticketId, onBack }) {
  const { data: ticket, isLoading } = useMyTicket(ticketId);
  const reply = useReplyToTicket(ticketId);
  const [message, setMessage] = useState("");

  const send = () => {
    if (!message.trim()) return;
    reply.mutate(message.trim(), { onSuccess: () => setMessage("") });
  };

  if (isLoading || !ticket) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-brand-500 animate-spin" /></div>;
  }

  return (
    <div className="card flex flex-col h-[600px]">
      <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <button onClick={onBack} className="p-1.5 hover:bg-gray-100 rounded-lg mt-0.5 flex-shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900 truncate">{ticket.subject}</h2>
            <p className="text-xs text-gray-400">Opened {new Date(ticket.createdAt).toLocaleDateString()}</p>
          </div>
        </div>
        <StatusBadge status={ticket.status} className="flex-shrink-0" />
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-gray-50">
        {ticket.messages.map((m) => {
          const isMine = m.senderRole === "customer";
          return (
            <div key={m._id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-2 ${
                isMine ? "bg-brand-600 text-white" : "bg-white border border-gray-200 text-gray-700"
              }`}>
                <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                <p className={`text-xs mt-1 ${isMine ? "text-brand-100" : "text-gray-400"}`}>
                  {isMine ? "You" : "Support"} · {new Date(m.createdAt).toLocaleTimeString()}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {ticket.status === "closed" ? (
        <div className="px-5 py-4 border-t border-gray-100 text-center text-sm text-gray-400">
          This ticket is closed. Open a new ticket if you need further help.
        </div>
      ) : (
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <Input
            placeholder="Type your reply..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            className="flex-1"
          />
          <Button onClick={send} loading={reply.isPending}><Send className="w-4 h-4" /></Button>
        </div>
      )}
    </div>
  );
}

export default function SupportPage() {
  const [page, setPage] = useState(1);
  const [showNew, setShowNew] = useState(false);
  const [activeId, setActiveId] = useState(null);

  const { data, isLoading } = useMyTickets({ page, limit: 15 });
  const tickets = data?.data || [];
  const pagination = data?.pagination || {};

  if (activeId) {
    return <TicketThread ticketId={activeId} onBack={() => setActiveId(null)} />;
  }

  return (
    <>
      {showNew && (
        <NewTicketModal onClose={() => setShowNew(false)} onCreated={(id) => { setShowNew(false); setActiveId(id); }} />
      )}

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Support</h1>
            <p className="text-sm text-gray-500 mt-0.5">Get help with your licenses or account</p>
          </div>
          <Button onClick={() => setShowNew(true)}><Plus className="w-4 h-4" /> New ticket</Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-40"><Loader2 className="w-8 h-8 text-brand-500 animate-spin" /></div>
        ) : tickets.length === 0 ? (
          <div className="card p-12 text-center">
            <HeadphonesIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No tickets yet</p>
            <p className="text-sm text-gray-400 mt-1">Need help? Open a ticket and we'll get back to you.</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="divide-y divide-gray-50">
              {tickets.map((t) => (
                <button key={t._id} onClick={() => setActiveId(t._id)}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 text-left transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{t.subject}</p>
                    <p className="text-xs text-gray-400">{new Date(t.lastMessageAt).toLocaleString()}</p>
                  </div>
                  <StatusBadge status={t.status} className="flex-shrink-0 ml-3" />
                </button>
              ))}
            </div>
            <div className="px-5 pb-4">
              <Pagination {...pagination} onPage={setPage} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
