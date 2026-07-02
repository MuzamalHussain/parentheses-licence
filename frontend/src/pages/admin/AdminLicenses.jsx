import { useState } from "react";
import {
  Key, Plus, Search, Ban, CheckCircle, Trash2,
  RotateCcw, Loader2, ChevronDown, X, Copy, Check
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import api from "../../lib/api";
import { Button, Input, FormField, Alert } from "../../components/ui";
import StatusBadge from "../../components/ui/StatusBadge";
import Pagination from "../../components/ui/Pagination";
import { useAdminLicenses, useAdminLicenseStats, useCreateLicense, useLicenseAction } from "../../hooks/useLicenses";

// ── Copy Key Button ────────────────────────────────────────────────────────────
function CopyKey({ licenseKey }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(licenseKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} className="ml-1.5 text-gray-400 hover:text-gray-600" title="Copy key">
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ── Create License Modal ───────────────────────────────────────────────────────
const createSchema = z.object({
  userId:               z.string().min(1, "Customer required"),
  productId:            z.string().min(1, "Product required"),
  planId:               z.string().min(1, "Plan required"),
  expiresAt:            z.string().optional(),
  allowedSitesOverride: z.coerce.number().int().min(0).optional(),
  notes:                z.string().max(1000).optional(),
});

function CreateLicenseModal({ onClose }) {
  const { mutateAsync, isPending } = useCreateLicense();
  const [products, setProducts] = useState([]);
  const [plans, setPlans]       = useState([]);
  const [users, setUsers]       = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [serverError, setServerError] = useState("");

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(createSchema),
  });

  const selectedProduct = watch("productId");

  // Load products on mount
  useState(() => {
    api.get("/products?limit=50").then((r) => setProducts(r.data.data || []));
  }, []);

  // Load plans when product changes
  const onProductChange = async (e) => {
    setValue("productId", e.target.value);
    setValue("planId", "");
    setPlans([]);
    if (e.target.value) {
      const r = await api.get(`/products/${e.target.value}/plans?limit=50`);
      setPlans(r.data.data || []);
    }
  };

  // Search users
  const searchUsers = async (q) => {
    setUserSearch(q);
    if (q.length < 2) { setUsers([]); return; }
    const r = await api.get(`/admin/users?search=${q}&limit=8`);
    setUsers(r.data.data || []);
  };

  const onSubmit = async (values) => {
    setServerError("");
    try {
      const payload = { ...values };
      if (!payload.expiresAt) delete payload.expiresAt;
      if (payload.allowedSitesOverride === "" || payload.allowedSitesOverride === undefined)
        delete payload.allowedSitesOverride;
      await mutateAsync(payload);
      onClose();
    } catch (err) {
      setServerError(err.response?.data?.message || "Error creating license.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Create License</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <Alert type="error" message={serverError} />

          {/* Customer search */}
          <FormField label="Customer" error={errors.userId?.message} required>
            <Input
              placeholder="Search by name or email..."
              value={userSearch}
              onChange={(e) => searchUsers(e.target.value)}
            />
            {users.length > 0 && (
              <div className="border border-gray-200 rounded-lg mt-1 shadow-sm bg-white z-10">
                {users.map((u) => (
                  <button key={u.id} type="button"
                    onClick={() => { setValue("userId", u.id); setUserSearch(`${u.name} (${u.email})`); setUsers([]); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0">
                    <span className="font-medium">{u.name}</span>
                    <span className="text-gray-400 ml-2">{u.email}</span>
                  </button>
                ))}
              </div>
            )}
            <input type="hidden" {...register("userId")} />
          </FormField>

          {/* Product */}
          <FormField label="Product" error={errors.productId?.message} required>
            <select className="input" onChange={onProductChange} defaultValue="">
              <option value="" disabled>Select product...</option>
              {products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
            <input type="hidden" {...register("productId")} />
          </FormField>

          {/* Plan */}
          <FormField label="Plan" error={errors.planId?.message} required>
            <select className="input" {...register("planId")} disabled={!selectedProduct || plans.length === 0}>
              <option value="">Select plan...</option>
              {plans.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name} — {p.allowedSites === 0 ? "Unlimited" : p.allowedSites} site{p.allowedSites !== 1 ? "s" : ""} · ${p.priceUSD}
                </option>
              ))}
            </select>
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Expires at (optional)" error={errors.expiresAt?.message}>
              <Input {...register("expiresAt")} type="datetime-local" />
            </FormField>
            <FormField label="Sites override (optional)" error={errors.allowedSitesOverride?.message}>
              <Input {...register("allowedSitesOverride")} type="number" placeholder="Leave blank = plan default" />
            </FormField>
          </div>

          <FormField label="Internal notes" error={errors.notes?.message}>
            <textarea {...register("notes")} rows={2} className="input resize-none" placeholder="Optional admin notes..." />
          </FormField>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={isPending} className="flex-1">Create license</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Action Confirmation Modal ──────────────────────────────────────────────────
function ConfirmModal({ title, message, confirmLabel, confirmClass = "btn-primary", onConfirm, onClose, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500">{message}</p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <button onClick={onConfirm} disabled={loading}
            className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-60 ${confirmClass}`}>
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── License Row ───────────────────────────────────────────────────────────────
function LicenseRow({ license }) {
  const [expanded, setExpanded] = useState(false);
  const [confirm, setConfirm]   = useState(null); // { action, title, message, confirmLabel, confirmClass }
  const action = useLicenseAction();

  const doAction = (a) =>
    action.mutate({ id: license._id, action: a }, { onSettled: () => setConfirm(null) });

  const exp = license.expiresAt ? new Date(license.expiresAt) : null;
  const isExpired = exp && exp < new Date();

  return (
    <>
      {confirm && (
        <ConfirmModal {...confirm}
          loading={action.isPending}
          onConfirm={() => doAction(confirm.action)}
          onClose={() => setConfirm(null)}
        />
      )}

      <div className="card overflow-hidden">
        {/* Main row */}
        <div className="px-4 py-3 flex items-center gap-3">
          {/* Key */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span className="font-mono text-sm font-semibold text-gray-800 tracking-wide">
                {license.licenseKey}
              </span>
              <CopyKey licenseKey={license.licenseKey} />
            </div>
            <p className="text-xs text-gray-400 truncate mt-0.5">
              {license.userId?.name} · {license.productId?.name} — {license.planId?.name}
            </p>
          </div>

          {/* Sites */}
          <div className="text-center hidden sm:block w-20 flex-shrink-0">
            <p className="text-sm font-medium text-gray-700">
              {license.activeDomains?.length ?? 0}/{license.allowedSites === 0 ? "∞" : license.allowedSites}
            </p>
            <p className="text-xs text-gray-400">sites</p>
          </div>

          {/* Expiry */}
          <div className="text-center hidden md:block w-28 flex-shrink-0">
            {exp ? (
              <>
                <p className={`text-xs font-medium ${isExpired ? "text-red-500" : "text-gray-600"}`}>
                  {isExpired ? "Expired" : exp.toLocaleDateString()}
                </p>
                {!isExpired && <p className="text-xs text-gray-400">expiry</p>}
              </>
            ) : (
              <span className="text-xs text-gray-400">Lifetime</span>
            )}
          </div>

          {/* Status */}
          <StatusBadge status={license.status} className="flex-shrink-0" />

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0 ml-1">
            {license.status === "active" && (
              <button title="Suspend"
                onClick={() => setConfirm({ action: "suspend", title: "Suspend License?", message: "The plugin will reject activation checks while suspended. You can reinstate anytime.", confirmLabel: "Suspend", confirmClass: "bg-yellow-500 text-white hover:bg-yellow-600 rounded-lg" })}
                className="p-1.5 hover:bg-yellow-50 rounded-lg text-gray-400 hover:text-yellow-600">
                <Ban className="w-4 h-4" />
              </button>
            )}
            {license.status === "suspended" && (
              <button title="Reinstate"
                onClick={() => setConfirm({ action: "reinstate", title: "Reinstate License?", message: "License will become active again.", confirmLabel: "Reinstate", confirmClass: "bg-green-600 text-white hover:bg-green-700 rounded-lg" })}
                className="p-1.5 hover:bg-green-50 rounded-lg text-gray-400 hover:text-green-600">
                <CheckCircle className="w-4 h-4" />
              </button>
            )}
            {license.status !== "revoked" && (
              <button title="Revoke permanently"
                onClick={() => setConfirm({ action: "revoke", title: "Revoke License?", message: "This permanently disables the license. This action cannot be undone.", confirmLabel: "Revoke", confirmClass: "bg-red-600 text-white hover:bg-red-700 rounded-lg" })}
                className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button title="Reset activations"
              onClick={() => setConfirm({ action: "reset-activations", title: "Reset Activations?", message: "All activated domains will be cleared. The customer will need to re-activate.", confirmLabel: "Reset", confirmClass: "bg-brand-600 text-white hover:bg-brand-700 rounded-lg" })}
              className="p-1.5 hover:bg-brand-50 rounded-lg text-gray-400 hover:text-brand-600">
              <RotateCcw className="w-4 h-4" />
            </button>
            <button onClick={() => setExpanded((v) => !v)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
              <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>

        {/* Expanded: active domains */}
        {expanded && (
          <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
            <p className="text-xs font-medium text-gray-500 mb-2">ACTIVE DOMAINS</p>
            {license.activeDomains?.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No domains activated yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {license.activeDomains.map((d) => (
                  <span key={d.domain}
                    className="text-xs bg-white border border-gray-200 rounded-md px-2 py-1 font-mono text-gray-700">
                    {d.domain}
                  </span>
                ))}
              </div>
            )}
            {license.notes && (
              <p className="text-xs text-gray-500 mt-3 italic">Note: {license.notes}</p>
            )}
            <p className="text-xs text-gray-400 mt-2">
              Created {new Date(license.createdAt).toLocaleString()}
            </p>
          </div>
        )}
      </div>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminLicenses() {
  const [showCreate, setShowCreate] = useState(false);
  const [page, setPage]       = useState(1);
  const [search, setSearch]   = useState("");
  const [status, setStatus]   = useState("");

  const { data, isLoading } = useAdminLicenses({ page, limit: 15, search, status });
  const { data: stats }     = useAdminLicenseStats();

  const licenses   = data?.data || [];
  const pagination = data?.pagination || {};

  return (
    <>
      {showCreate && <CreateLicenseModal onClose={() => setShowCreate(false)} />}

      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Licenses</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {stats?.stats.total ?? "—"} total · {stats?.stats.active ?? "—"} active
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" /> New license
          </Button>
        </div>

        {/* Stat Pills */}
        {stats && (
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Active",    val: stats.stats.active,    color: "bg-green-100 text-green-700" },
              { label: "Suspended", val: stats.stats.suspended, color: "bg-yellow-100 text-yellow-700" },
              { label: "Revoked",   val: stats.stats.revoked,   color: "bg-red-100 text-red-700" },
              { label: "Expired",   val: stats.stats.expired,   color: "bg-gray-100 text-gray-600" },
            ].map(({ label, val, color }) => (
              <button key={label}
                onClick={() => { setStatus(status === label.toLowerCase() ? "" : label.toLowerCase()); setPage(1); }}
                className={`text-xs font-medium px-3 py-1 rounded-full transition-all ${
                  status === label.toLowerCase() ? color + " ring-2 ring-offset-1 ring-current" : color + " opacity-70 hover:opacity-100"
                }`}>
                {val} {label}
              </button>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search by license key..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          {(search || status) && (
            <Button variant="secondary" onClick={() => { setSearch(""); setStatus(""); setPage(1); }}>
              <X className="w-4 h-4" /> Clear
            </Button>
          )}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
          </div>
        ) : licenses.length === 0 ? (
          <div className="card p-12 text-center">
            <Key className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No licenses found</p>
            <p className="text-sm text-gray-400 mt-1">
              {search || status ? "Try clearing your filters." : "Create your first license above."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {licenses.map((l) => <LicenseRow key={l._id} license={l} />)}
          </div>
        )}

        <Pagination {...pagination} onPage={setPage} />
      </div>
    </>
  );
}
