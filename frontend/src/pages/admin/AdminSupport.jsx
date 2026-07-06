import { useState } from "react";
import { Link } from "react-router-dom";
import { Ticket, Loader2, Send, X, Clock, CheckCircle2, MessageCircle } from "lucide-react";
import { Input, Button } from "../../components/ui";
import StatusBadge from "../../components/ui/StatusBadge";
import Pagination from "../../components/ui/Pagination";
import {
  useAdminTickets, useAdminTicketStats, useAdminTicket,
  useAdminReplyToTicket, useUpdateTicketStatus
} from "../../hooks/useSupport";

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="card p-4">
      <div className={`inline-flex p-1.5 rounded-lg ${color} mb-2`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-xl font-bold text-gray-900">{value ?? "—"}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function getId(value) {
  return value?.id || value?._id;
}

function TicketDrawer({ ticketId, onClose }) {
  const { data: ticket, isLoading } = useAdminTicket(ticketId);
  const reply = useAdminReplyToTicket(ticketId);
  const updateStatus = useUpdateTicketStatus(ticketId);
  const [message, setMessage] = useState("");

  const send = () => {
    if (!message.trim()) return;
    reply.mutate(message.trim(), { onSuccess: () => setMessage("") });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col">
        {isLoading || !ticket ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 text-brand-500 animate-spin" /></div>
        ) : (
          <>
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900 truncate">{ticket.subject}</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {getId(ticket.userId) ? (
                      <Link to={`/admin/users/${getId(ticket.userId)}`} className="text-brand-600 hover:underline">
                        {ticket.userId?.name}
                      </Link>
                    ) : (
                      ticket.userId?.name
                    )}{" "}
                    - {ticket.userId?.email}
                    {ticket.licenseId && <> - <span className="font-mono">{ticket.licenseId.licenseKey}</span></>}
                  </p>
                </div>
                <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg flex-shrink-0"><X className="w-4 h-4" /></button>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <StatusBadge status={ticket.status} />
                {ticket.status !== "closed" ? (
                  <button onClick={() => updateStatus.mutate("closed")}
                    className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Mark closed
                  </button>
                ) : (
                  <button onClick={() => updateStatus.mutate("open")}
                    className="text-xs text-brand-600 hover:underline">
                    Reopen
                  </button>
                )}
              </div>
            </div>

            {/* Thread */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-gray-50">
              {ticket.messages.map((m) => {
                const isAdmin = m.senderRole === "admin" || m.senderRole === "support";
                return (
                  <div key={m._id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-lg px-3 py-2 ${
                      isAdmin ? "bg-brand-600 text-white" : "bg-white border border-gray-200 text-gray-700"
                    }`}>
                      <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                      <p className={`text-xs mt-1 ${isAdmin ? "text-brand-100" : "text-gray-400"}`}>
                        {m.senderId?.name || (isAdmin ? "Support" : "Customer")} · {new Date(m.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Reply box */}
            {ticket.status !== "closed" && (
              <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
                <Input
                  placeholder="Type a reply..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  className="flex-1"
                />
                <Button onClick={send} loading={reply.isPending}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminSupport() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [activeTicket, setActiveTicket] = useState(null);

  const { data, isLoading } = useAdminTickets({ page, limit: 20, status });
  const { data: stats } = useAdminTicketStats();

  const tickets = data?.data || [];
  const pagination = data?.pagination || {};

  return (
    <>
      {activeTicket && <TicketDrawer ticketId={activeTicket} onClose={() => setActiveTicket(null)} />}

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Support</h1>
          <p className="text-sm text-gray-500 mt-0.5">Shared queue — all tickets visible to all admins</p>
        </div>

        <div className="grid grid-cols-3 gap-4 max-w-md">
          <StatCard label="Open" value={stats?.open} icon={MessageCircle} color="text-blue-600 bg-blue-50" />
          <StatCard label="Pending" value={stats?.pending} icon={Clock} color="text-yellow-600 bg-yellow-50" />
          <StatCard label="Closed" value={stats?.closed} icon={CheckCircle2} color="text-gray-600 bg-gray-100" />
        </div>

        <div className="flex gap-2">
          {["", "open", "pending", "closed"].map((s) => (
            <button key={s} onClick={() => { setStatus(s); setPage(1); }}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                status === s ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-600 border-gray-200 hover:border-brand-400"
              }`}>
              {s === "" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-40"><Loader2 className="w-8 h-8 text-brand-500 animate-spin" /></div>
        ) : tickets.length === 0 ? (
          <div className="card p-12 text-center">
            <Ticket className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No tickets found</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="divide-y divide-gray-50">
              {tickets.map((t) => (
                <div
                  key={t._id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveTicket(t._id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") setActiveTicket(t._id);
                  }}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 text-left transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{t.subject}</p>
                    <p className="text-xs text-gray-400">
                      {getId(t.userId) ? (
                        <Link
                          to={`/admin/users/${getId(t.userId)}`}
                          onClick={(event) => event.stopPropagation()}
                          className="text-brand-600 hover:underline"
                        >
                          {t.userId?.name}
                        </Link>
                      ) : (
                        t.userId?.name
                      )}{" "}
                      - {new Date(t.lastMessageAt).toLocaleString()}
                    </p>
                  </div>
                  <StatusBadge status={t.status} className="flex-shrink-0 ml-3" />
                </div>
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
