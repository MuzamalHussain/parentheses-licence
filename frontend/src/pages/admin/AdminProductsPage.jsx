import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Package, Plus, Edit2, Archive, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import api from "../../lib/api";
import { Button, Input, FormField, Alert } from "../../components/ui";

// ── Product Form Schema ───────────────────────────────────────────────────────
const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  status: z.enum(["active", "archived"]),
});

const planSchema = z.object({
  name: z.string().min(1),
  allowedSites: z.coerce.number().int().min(0),
  priceUSD: z.coerce.number().min(0),
  priceLocal: z.coerce.number().min(0),
  durationDays: z.coerce.number().int().min(0).optional(),
  renewalType: z.enum(["recurring", "one-time"]),
});

// ── Hooks ─────────────────────────────────────────────────────────────────────
const fetchProducts = () =>
  api.get("/products?limit=50").then((r) => r.data);

// ── Product Modal ─────────────────────────────────────────────────────────────
function ProductModal({ existing, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!existing;
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(productSchema),
    defaultValues: existing || { status: "active" },
  });

  const onSubmit = async (values) => {
    try {
      if (isEdit) await api.patch(`/products/${existing._id}`, values);
      else await api.post("/products", values);
      toast.success(isEdit ? "Product updated." : "Product created.");
      qc.invalidateQueries(["admin-products"]);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || "Error saving product.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="p-6 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{isEdit ? "Edit Product" : "New Product"}</h2>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <FormField label="Product name" error={errors.name?.message} required>
            <Input {...register("name")} placeholder="e.g. SEO Pro Plugin" error={errors.name} />
          </FormField>
          <FormField label="Description" error={errors.description?.message}>
            <textarea {...register("description")} rows={3}
              className="input resize-none" placeholder="Brief description..." />
          </FormField>
          <FormField label="Status" error={errors.status?.message} required>
            <select {...register("status")} className="input">
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </FormField>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={isSubmitting} className="flex-1">
              {isEdit ? "Save changes" : "Create product"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Plan Modal ────────────────────────────────────────────────────────────────
function PlanModal({ productId, existing, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!existing;
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(planSchema),
    defaultValues: existing || { renewalType: "recurring", durationDays: 365 },
  });

  const onSubmit = async (values) => {
    try {
      if (isEdit) await api.patch(`/products/${productId}/plans/${existing._id}`, values);
      else await api.post(`/products/${productId}/plans`, values);
      toast.success(isEdit ? "Plan updated." : "Plan created.");
      qc.invalidateQueries(["admin-products"]);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || "Error saving plan.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl">
        <div className="p-6 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{isEdit ? "Edit Plan" : "New Plan"}</h2>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <FormField label="Plan name" error={errors.name?.message} required>
            <Input {...register("name")} placeholder="e.g. Single Site" error={errors.name} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Price (USD $)" error={errors.priceUSD?.message} required>
              <Input {...register("priceUSD")} type="number" step="0.01" placeholder="49.00" error={errors.priceUSD} />
            </FormField>
            <FormField label="Price (PKR ₨)" error={errors.priceLocal?.message} required>
              <Input {...register("priceLocal")} type="number" placeholder="13500" error={errors.priceLocal} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Allowed sites (0 = unlimited)" error={errors.allowedSites?.message} required>
              <Input {...register("allowedSites")} type="number" placeholder="1" error={errors.allowedSites} />
            </FormField>
            <FormField label="Duration (days, 0 = lifetime)" error={errors.durationDays?.message}>
              <Input {...register("durationDays")} type="number" placeholder="365" error={errors.durationDays} />
            </FormField>
          </div>
          <FormField label="Renewal type" error={errors.renewalType?.message} required>
            <select {...register("renewalType")} className="input">
              <option value="recurring">Recurring</option>
              <option value="one-time">One-time (Lifetime)</option>
            </select>
          </FormField>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={isSubmitting} className="flex-1">
              {isEdit ? "Save changes" : "Create plan"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Product Row ───────────────────────────────────────────────────────────────
function ProductRow({ product }) {
  const [expanded, setExpanded] = useState(false);
  const [productModal, setProductModal] = useState(null);
  const [planModal, setPlanModal] = useState(null);
  const qc = useQueryClient();

  const archiveMutation = useMutation({
    mutationFn: () => api.delete(`/products/${product._id}`),
    onSuccess: () => { toast.success("Product archived."); qc.invalidateQueries(["admin-products"]); },
    onError: (err) => toast.error(err.response?.data?.message || "Error archiving product."),
  });

  const deactivatePlan = useMutation({
    mutationFn: (planId) => api.delete(`/products/${product._id}/plans/${planId}`),
    onSuccess: () => { toast.success("Plan deactivated."); qc.invalidateQueries(["admin-products"]); },
    onError: (err) => toast.error(err.response?.data?.message || "Error."),
  });

  return (
    <>
      {productModal && <ProductModal existing={productModal} onClose={() => setProductModal(null)} />}
      {planModal !== null && (
        <PlanModal
          productId={product._id}
          existing={planModal === true ? null : planModal}
          onClose={() => setPlanModal(null)}
        />
      )}

      <div className="card overflow-hidden">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 bg-brand-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <Package className="w-5 h-5 text-brand-600" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-gray-900 truncate">{product.name}</p>
              <p className="text-xs text-gray-400 truncate">{product.slug}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-3 flex-shrink-0">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              product.status === "active" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
            }`}>
              {product.status}
            </span>
            <button onClick={() => setProductModal(product)} className="p-1.5 hover:bg-gray-100 rounded-lg" title="Edit">
              <Edit2 className="w-4 h-4 text-gray-500" />
            </button>
            <button onClick={() => archiveMutation.mutate()} className="p-1.5 hover:bg-red-50 rounded-lg" title="Archive">
              <Archive className="w-4 h-4 text-gray-400 hover:text-red-500" />
            </button>
            <button onClick={() => setExpanded((v) => !v)} className="p-1.5 hover:bg-gray-100 rounded-lg">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="border-t border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-gray-700">Plans</p>
              <Button variant="secondary" onClick={() => setPlanModal(true)} className="text-xs py-1 px-2 h-7">
                <Plus className="w-3 h-3" /> Add plan
              </Button>
            </div>

            {product.plans?.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No plans yet. Add one above.</p>
            ) : (
              <div className="space-y-2">
                {product.plans?.map((plan) => (
                  <div key={plan._id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{plan.name}</p>
                      <p className="text-xs text-gray-400">
                        ${plan.priceUSD} USD · ₨{plan.priceLocal?.toLocaleString()} PKR ·{" "}
                        {plan.allowedSites === 0 ? "Unlimited" : plan.allowedSites} site{plan.allowedSites !== 1 ? "s" : ""} ·{" "}
                        {plan.renewalType}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${plan.isActive ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"}`}>
                        {plan.isActive ? "active" : "inactive"}
                      </span>
                      <button onClick={() => setPlanModal(plan)} className="p-1 hover:bg-white rounded">
                        <Edit2 className="w-3 h-3 text-gray-400" />
                      </button>
                      {plan.isActive && (
                        <button onClick={() => deactivatePlan.mutate(plan._id)} className="p-1 hover:bg-red-50 rounded">
                          <Archive className="w-3 h-3 text-gray-400 hover:text-red-500" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Main Admin Products Page ──────────────────────────────────────────────────
export default function AdminProductsPage() {
  const [showModal, setShowModal] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-products"],
    queryFn: fetchProducts,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
    </div>
  );

  if (error) return <Alert type="error" message="Failed to load products. Make sure the API is running." />;

  const products = data?.data || [];

  return (
    <>
      {showModal && <ProductModal onClose={() => setShowModal(false)} />}

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Products & Plans</h1>
            <p className="text-sm text-gray-500 mt-0.5">{products.length} product{products.length !== 1 ? "s" : ""}</p>
          </div>
          <Button onClick={() => setShowModal(true)}>
            <Plus className="w-4 h-4" /> New product
          </Button>
        </div>

        {products.length === 0 ? (
          <div className="card p-12 text-center">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No products yet</p>
            <p className="text-gray-400 text-sm mt-1">Create your first product to get started.</p>
            <Button className="mt-4" onClick={() => setShowModal(true)}>
              <Plus className="w-4 h-4" /> Create product
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {products.map((p) => <ProductRow key={p._id} product={p} />)}
          </div>
        )}
      </div>
    </>
  );
}
