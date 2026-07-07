import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { ShoppingCart, Loader2, CheckCircle2, XCircle, Clock, Key, Download } from "lucide-react";
import toast from "react-hot-toast";
import { useMyOrders, useMyOrder, useRetryPayment } from "../../hooks/useOrders";
import StatusBadge from "../../components/ui/StatusBadge";
import Pagination from "../../components/ui/Pagination";

function isComplete(order) {
  return ["paid", "completed"].includes(order?.status);
}

function formatMoney(order) {
  const value = Number(order.grandTotal ?? order.amount ?? 0);
  const prefix = order.currency === "USD" ? "$" : order.currency === "PKR" ? "Rs " : `${order.currency || ""} `;
  return `${prefix}${value.toLocaleString()}`;
}

function productLabel(order) {
  if (order.items?.length) {
    return order.items.map((item) => `${item.productName || order.productId?.name || "Product"} - ${item.planName || order.planId?.name || "Plan"}`).join(", ");
  }
  return `${order.productId?.name || "Product"} - ${order.planId?.name || "Plan"}`;
}

function RedirectBanner() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status");
  const orderId = params.get("orderId");
  const [attempt, setAttempt] = useState(0);

  const { data: order, refetch } = useMyOrder(orderId, { enabled: !!orderId && status === "success" });

  useEffect(() => {
    if (status === "success" && order?.status === "pending" && attempt < 5) {
      const t = setTimeout(() => { refetch(); setAttempt((a) => a + 1); }, 2000);
      return () => clearTimeout(t);
    }
    if (status === "success" && isComplete(order)) {
      toast.success("Payment confirmed! Your license is ready.");
    }
  }, [order, attempt, status, refetch]);

  if (!status || !orderId) return null;

  const dismiss = () => { params.delete("status"); params.delete("orderId"); setParams(params); };

  if (status === "cancelled") {
    return (
      <div className="card p-4 flex items-center gap-3 bg-yellow-50 border-yellow-200">
        <XCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
        <p className="text-sm text-yellow-800 flex-1">Checkout was cancelled. No payment was made.</p>
        <button onClick={dismiss} className="text-xs text-yellow-700 hover:underline">Dismiss</button>
      </div>
    );
  }

  if (status === "success") {
    if (!order || order.status === "pending") {
      return (
        <div className="card p-4 flex items-center gap-3 bg-blue-50 border-blue-200">
          <Loader2 className="w-5 h-5 text-blue-600 animate-spin flex-shrink-0" />
          <p className="text-sm text-blue-800 flex-1">Confirming your payment... this usually takes a few seconds.</p>
        </div>
      );
    }
    if (isComplete(order)) {
      return (
        <div className="card p-4 flex items-center gap-3 bg-green-50 border-green-200">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-green-800 font-medium">Payment successful!</p>
            {order.licenseId && (
              <p className="text-xs text-green-700 mt-0.5">
                License key: <span className="font-mono font-semibold">{order.licenseId.licenseKey}</span>
              </p>
            )}
          </div>
          <Link to="/dashboard/licenses" className="text-xs text-green-700 hover:underline flex items-center gap-1 flex-shrink-0">
            <Key className="w-3.5 h-3.5" /> View license
          </Link>
        </div>
      );
    }
    return (
      <div className="card p-4 flex items-center gap-3 bg-red-50 border-red-200">
        <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
        <p className="text-sm text-red-700 flex-1">Payment did not complete ({order.status}). {order.failureReason}</p>
        <button onClick={dismiss} className="text-xs text-red-600 hover:underline">Dismiss</button>
      </div>
    );
  }
  return null;
}

function statusIcon(status) {
  if (["paid", "completed"].includes(status)) return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (["draft", "pending", "processing"].includes(status)) return <Clock className="w-4 h-4 text-yellow-500" />;
  return <XCircle className="w-4 h-4 text-red-400" />;
}

export default function OrdersPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useMyOrders({ page, limit: 15 });
  const retryPayment = useRetryPayment();

  const orders = data?.data || [];
  const pagination = data?.pagination || {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Orders &amp; Billing</h1>
        <p className="text-sm text-gray-500 mt-0.5">Your purchase history</p>
      </div>

      <RedirectBanner />

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
        </div>
      ) : orders.length === 0 ? (
        <div className="card p-12 text-center">
          <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">No orders yet</p>
          <p className="text-sm text-gray-400 mt-1">
            <Link to="/dashboard/plans" className="text-brand-600 hover:underline">Browse plans</Link> to make your first purchase.
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-gray-50">
            {orders.map((o) => (
              <div key={o._id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="flex items-center gap-3 min-w-0">
                  {statusIcon(o.status)}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{productLabel(o)}</p>
                    <p className="text-xs text-gray-400">
                      <span className="font-mono">{o.orderNumber || o._id}</span> · {new Date(o.createdAt).toLocaleDateString()} · {o.gateway === "none" ? "Checkout session" : o.gateway}
                      {o.licenseId && <> · <span className="font-mono">{o.licenseId.licenseKey}</span></>}
                    </p>
                    {isComplete(o) && (
                      <p className="text-xs text-gray-500 mt-1 flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1"><Download className="w-3 h-3" /> Downloads {o.downloadEligible ? "enabled" : "pending"}</span>
                        <span>Renewal {o.renewalEligible ? "eligible" : "pending"}</span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm font-semibold text-gray-800">{formatMoney(o)}</span>
                  {["failed", "cancelled", "expired"].includes(o.status) && ["stripe", "local"].includes(o.gateway) && (
                    <button
                      onClick={() => retryPayment.mutate(o._id)}
                      className="text-xs font-medium text-brand-600 hover:text-brand-700"
                    >
                      Retry
                    </button>
                  )}
                  <StatusBadge status={o.status} />
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 pb-4">
            <Pagination {...pagination} onPage={setPage} />
          </div>
        </div>
      )}
    </div>
  );
}
