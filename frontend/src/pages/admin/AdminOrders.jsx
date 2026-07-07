import { useState } from "react";
import { Link } from "react-router-dom";
import { ShoppingCart, DollarSign, Loader2, Undo2, CheckCircle2, XCircle } from "lucide-react";
import { Input, Button, Alert } from "../../components/ui";
import StatusBadge from "../../components/ui/StatusBadge";
import Pagination from "../../components/ui/Pagination";
import { useAdminOrders, useAdminOrderStats, useMarkRefunded, useAdminOrderAction } from "../../hooks/useOrders";

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="card p-5">
      <div className={`inline-flex p-2 rounded-lg ${color} mb-3`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value ?? "-"}</p>
      <p className="text-sm text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function getId(value) {
  return value?.id || value?._id;
}

function formatMoney(order) {
  const value = Number(order.grandTotal ?? order.amount ?? 0);
  const prefix = order.currency === "USD" ? "$" : order.currency === "PKR" ? "Rs " : `${order.currency || ""} `;
  return `${prefix}${value.toLocaleString()}`;
}

function productLabel(order) {
  if (order.items?.length) {
    return order.items
      .map((item) => `${item.productName || order.productId?.name || "Product"} - ${item.planName || order.planId?.name || "Plan"}`)
      .join(", ");
  }
  return `${order.productId?.name || "Product"} - ${order.planId?.name || "Plan"}`;
}

function RefundModal({ order, onClose }) {
  const { mutate, isPending } = useMarkRefunded();
  const [reason, setReason] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">Mark Order as Refunded?</h3>
        <p className="text-sm text-gray-500">
          This records the refund foundation and revokes the associated license immediately.
        </p>
        <Input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 bg-red-600 hover:bg-red-700 focus:ring-red-500" loading={isPending}
            onClick={() => mutate({ id: order._id, reason }, { onSuccess: onClose })}>
            Confirm refund
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AdminOrders() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [gateway, setGateway] = useState("");
  const [refundOrder, setRefundOrder] = useState(null);
  const orderAction = useAdminOrderAction();

  const { data, isLoading, error } = useAdminOrders({ page, limit: 15, status, gateway });
  const { data: stats } = useAdminOrderStats();

  const orders = data?.data || [];
  const pagination = data?.pagination || {};
  const completedCount = (stats?.stats.completed || 0) + (stats?.stats.paid || 0);

  return (
    <>
      {refundOrder && <RefundModal order={refundOrder} onClose={() => setRefundOrder(null)} />}

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <p className="text-sm text-gray-500 mt-0.5">All customer purchases</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard label="Total Revenue (USD)" value={stats ? `$${stats.totalRevenueUSD?.toLocaleString()}` : "-"} icon={DollarSign} color="text-green-600 bg-green-50" />
          <StatCard label="Completed" value={completedCount} icon={ShoppingCart} color="text-brand-600 bg-brand-50" />
          <StatCard label="Pending" value={stats?.stats.pending} icon={ShoppingCart} color="text-yellow-600 bg-yellow-50" />
          <StatCard label="Failed" value={stats?.stats.failed} icon={ShoppingCart} color="text-red-600 bg-red-50" />
          <StatCard label="Refunded" value={stats?.stats.refunded} icon={Undo2} color="text-gray-600 bg-gray-100" />
        </div>

        <div className="flex gap-2 flex-wrap">
          {["", "draft", "pending", "processing", "completed", "cancelled", "failed", "refunded"].map((s) => (
            <button key={s} onClick={() => { setStatus(s); setPage(1); }}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                status === s ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-600 border-gray-200 hover:border-brand-400"
              }`}>
              {s === "" ? "All statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
          <div className="h-6 w-px bg-gray-200 mx-1" />
          {["", "none", "manual", "stripe", "local", "paypal"].map((g) => (
            <button key={g} onClick={() => { setGateway(g); setPage(1); }}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                gateway === g ? "bg-purple-600 text-white border-purple-600" : "bg-white text-gray-600 border-gray-200 hover:border-purple-400"
              }`}>
              {g === "" ? "All gateways" : g}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-40"><Loader2 className="w-8 h-8 text-brand-500 animate-spin" /></div>
        ) : error ? (
          <Alert type="error" message="Failed to load orders." />
        ) : orders.length === 0 ? (
          <div className="card p-12 text-center">
            <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No orders found</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wide">
                    <th className="px-4 py-3 font-medium">Order</th>
                    <th className="px-4 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">Product</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium hidden sm:table-cell">Gateway</th>
                    <th className="px-4 py-3 font-medium hidden lg:table-cell">License</th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">Date</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {orders.map((o) => (
                    <tr key={o._id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs text-gray-700">{o.orderNumber || o._id}</p>
                        <p className="text-xs text-gray-400 capitalize">{o.paymentStatus || "unpaid"}</p>
                      </td>
                      <td className="px-4 py-3">
                        {getId(o.userId) ? (
                          <Link to={`/admin/users/${getId(o.userId)}`} className="text-gray-700 hover:text-brand-600 hover:underline">
                            {o.userId?.name}
                          </Link>
                        ) : (
                          <p className="text-gray-700">{o.userId?.name}</p>
                        )}
                        <p className="text-xs text-gray-400">{o.userId?.email}</p>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-gray-600">{productLabel(o)}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{formatMoney(o)}</td>
                      <td className="px-4 py-3 hidden sm:table-cell text-gray-500 capitalize">{o.gateway}</td>
                      <td className="px-4 py-3 hidden lg:table-cell font-mono text-xs text-gray-500">
                        {o.licenseId?.licenseKey || "-"}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-gray-400 text-xs">
                        {new Date(o.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {["draft", "pending", "processing"].includes(o.status) && (
                          <>
                            <button onClick={() => orderAction.mutate({ id: o._id, action: "complete", reason: "manual_completion" })} title="Complete order"
                              className="p-1.5 hover:bg-green-50 rounded-lg text-gray-400 hover:text-green-600 inline-flex">
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => orderAction.mutate({ id: o._id, action: "cancel", reason: "manual_cancellation" })} title="Cancel order"
                              className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 inline-flex">
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {["paid", "completed"].includes(o.status) && (
                          <button onClick={() => setRefundOrder(o)} title="Mark refunded"
                            className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 inline-flex">
                            <Undo2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 pb-4">
              <Pagination {...pagination} onPage={setPage} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
