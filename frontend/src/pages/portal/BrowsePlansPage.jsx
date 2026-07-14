import { useEffect, useState } from "react";
import { Package, Check, Loader2, CreditCard, Tag, X } from "lucide-react";
import toast from "react-hot-toast";
import api from "../../lib/api";
import { Button, Input, Alert } from "../../components/ui";
import { useCreateCheckout } from "../../hooks/useOrders";

// ── Checkout Modal ─────────────────────────────────────────────────────────────
function CheckoutModal({ product, plan, onClose }) {
  const { mutateAsync, isPending } = useCreateCheckout();
  const [gateway, setGateway] = useState("");
  const [providers, setProviders] = useState([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [couponCode, setCouponCode] = useState("");
  const [serverError, setServerError] = useState("");

  const price = gateway === "stripe" ? plan.priceUSD : plan.priceLocal;
  const symbol = gateway === "stripe" ? "$" : "₨";

  useEffect(() => {
    let active = true;
    api.get("/orders/payment-providers").then(({ data }) => {
      if (!active) return;
      const available = data.data || [];
      setProviders(available);
      setGateway(available[0]?.id || "");
    }).catch(() => active && setProviders([])).finally(() => active && setProvidersLoading(false));
    return () => { active = false; };
  }, []);

  const handlePay = async () => {
    setServerError("");
    if (!gateway) {
      setServerError("No payment method is currently available. Please contact support.");
      return;
    }
    try {
      const res = await mutateAsync({
        productId: product._id,
        planId: plan._id,
        gateway,
        ...(couponCode && { couponCode: couponCode.trim() }),
      });
      // Redirect to gateway-hosted checkout page
      window.location.href = res.data.checkoutUrl;
    } catch (err) {
      setServerError(err.response?.data?.message || "Could not start checkout.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">{product.name}</h2>
            <p className="text-sm text-gray-500">{plan.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6 space-y-5">
          <Alert type="error" message={serverError} />

          {/* Gateway selector */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Payment method</p>
            {providersLoading ? <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" />Checking payment providers…</div> : providers.length ? <div className="grid grid-cols-2 gap-3">{providers.map((item) => <button type="button" key={item.id} onClick={() => setGateway(item.id)} className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${gateway === item.id ? "border-brand-500 bg-brand-50" : "border-gray-200 hover:border-gray-300"}`}><CreditCard className={`w-5 h-5 ${gateway === item.id ? "text-brand-600" : "text-gray-400"}`} /><span className="text-sm font-medium">{item.name}</span><span className="text-xs text-gray-400">Hosted checkout</span></button>)}</div> : <Alert type="warning" message="No payment method is currently available. Please contact support." />}
          </div>

          {/* Coupon */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Coupon code (optional)</p>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Enter code"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                className="pl-9"
              />
            </div>
          </div>

          {/* Price summary */}
          <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
            <span className="text-sm text-gray-500">Total</span>
            <span className="text-xl font-bold text-gray-900">{symbol}{price?.toLocaleString()}</span>
          </div>

          <Button onClick={handlePay} loading={isPending} disabled={!gateway || providersLoading} className="w-full">
            Continue to payment
          </Button>
          <p className="text-xs text-gray-400 text-center">
            You'll be redirected to the provider's secure hosted checkout. Completion waits for server verification.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Plan Card ─────────────────────────────────────────────────────────────────
function PlanCard({ product, plan, onSelect }) {
  return (
    <div className="card p-5 flex flex-col hover:shadow-md transition-shadow">
      <p className="font-semibold text-gray-900">{plan.name}</p>
      <div className="mt-2 mb-1">
        <span className="text-2xl font-bold text-gray-900">${plan.priceUSD}</span>
        <span className="text-sm text-gray-400"> / {plan.renewalType === "one-time" ? "lifetime" : "year"}</span>
      </div>
      <p className="text-xs text-gray-400 mb-4">or ₨{plan.priceLocal?.toLocaleString()} via local gateway</p>

      <ul className="space-y-1.5 mb-5 flex-1">
        <li className="flex items-center gap-2 text-sm text-gray-600">
          <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
          {plan.allowedSites === 0 ? "Unlimited sites" : `${plan.allowedSites} site${plan.allowedSites !== 1 ? "s" : ""}`}
        </li>
        <li className="flex items-center gap-2 text-sm text-gray-600">
          <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
          {plan.renewalType === "one-time" ? "Lifetime updates" : `${plan.durationDays || 365}-day license`}
        </li>
        <li className="flex items-center gap-2 text-sm text-gray-600">
          <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
          Plugin downloads included
        </li>
      </ul>

      <Button onClick={() => onSelect(product, plan)} className="w-full" variant="secondary">
        Select plan
      </Button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BrowsePlansPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkout, setCheckout] = useState(null); // { product, plan }

  useEffect(() => {
    api.get("/products?limit=50")
      .then(async (r) => {
        const list = r.data.data || [];
        // Fetch plans for each product
        const withPlans = await Promise.all(
          list.map(async (p) => {
            const plansRes = await api.get(`/products/${p._id}/plans`);
            return { ...p, plans: plansRes.data.data || [] };
          })
        );
        setProducts(withPlans.filter((p) => p.plans.length > 0));
      })
      .catch(() => toast.error("Failed to load plans."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      {checkout && (
        <CheckoutModal product={checkout.product} plan={checkout.plan} onClose={() => setCheckout(null)} />
      )}

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Browse Plans</h1>
          <p className="text-sm text-gray-500 mt-0.5">Choose a plan to get your license key</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="card p-12 text-center">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No plans available yet</p>
            <p className="text-sm text-gray-400 mt-1">Check back soon.</p>
          </div>
        ) : (
          products.map((product) => (
            <div key={product._id}>
              <h2 className="font-semibold text-gray-800 mb-3">{product.name}</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {product.plans.map((plan) => (
                  <PlanCard key={plan._id} product={product} plan={plan}
                    onSelect={(p, pl) => setCheckout({ product: p, plan: pl })} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
