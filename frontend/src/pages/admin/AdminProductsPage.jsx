import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Package, Plus, Edit2, Archive, ChevronDown, ChevronUp, Loader2, Search } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import api from "../../lib/api";
import { Button, Input, FormField, Alert } from "../../components/ui";

const PRODUCT_STATUSES = ["draft", "private", "published", "active", "archived", "deprecated", "hidden"];
const RELEASE_CHANNELS = ["stable", "beta", "alpha"];
const LICENSE_TYPES = ["single_site", "multi_site", "unlimited", "subscription", "lifetime"];

const emptyToUndefined = (value) => (value === "" ? undefined : value);
const listFromText = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
};

const optionalText = (max) => z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.string().trim().url("Must be a valid URL").max(1000).optional());
const productSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(150),
  slug: optionalText(150),
  internalProductCode: optionalText(80),
  description: z.string().max(5000).optional(),
  shortDescription: z.string().max(500).optional(),
  status: z.enum(PRODUCT_STATUSES),
  price: z.coerce.number().min(0),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  licenseType: z.enum(LICENSE_TYPES),
  lifetimeSupport: z.boolean().optional(),
  lifetimeUpdates: z.boolean().optional(),
  renewalSupported: z.boolean().optional(),
  upgradeSupported: z.boolean().optional(),
  pluginSlug: optionalText(150),
  pluginFolder: optionalText(150),
  mainPluginFile: optionalText(150),
  textDomain: optionalText(150),
  minPhpVersion: optionalText(40),
  minWpVersion: optionalText(40),
  testedUpTo: optionalText(40),
  productLogo: optionalUrl,
  productBanner: optionalUrl,
  featuredImage: optionalUrl,
  supportedPlatforms: z.preprocess(listFromText, z.array(z.string().max(120)).max(50)),
  supportedPhpVersions: z.preprocess(listFromText, z.array(z.string().max(120)).max(50)),
  supportedWpVersions: z.preprocess(listFromText, z.array(z.string().max(120)).max(50)),
  dependencies: z.preprocess(listFromText, z.array(z.string().max(120)).max(50)),
  defaultReleaseChannel: z.enum(RELEASE_CHANNELS),
  stableBranch: z.string().trim().max(120),
  betaEnabled: z.boolean().optional(),
  alphaEnabled: z.boolean().optional(),
  downloadEnabled: z.boolean().optional(),
  publicDownloadDisabled: z.boolean().optional(),
  licenseRequired: z.boolean().optional(),
  productUrl: optionalUrl,
  metaTitle: optionalText(150),
  metaDescription: optionalText(320),
});

const planSchema = z.object({
  name: z.string().min(1),
  allowedSites: z.coerce.number().int().min(0),
  planType: z.enum(["single_site", "3_sites", "5_sites", "10_sites", "agency", "unlimited", "lifetime", "trial", "custom"]).optional(),
  upgradeRank: z.coerce.number().int().min(0).optional(),
  priceUSD: z.coerce.number().min(0),
  priceLocal: z.coerce.number().min(0),
  durationDays: z.coerce.number().int().min(0).optional(),
  renewalType: z.enum(["recurring", "one-time"]),
});

const lifecycleDefaults = {
  name: "",
  slug: "",
  internalProductCode: "",
  description: "",
  shortDescription: "",
  status: "draft",
  price: 0,
  currency: "USD",
  licenseType: "single_site",
  lifetimeSupport: false,
  lifetimeUpdates: false,
  renewalSupported: true,
  upgradeSupported: true,
  pluginSlug: "",
  pluginFolder: "",
  mainPluginFile: "",
  textDomain: "",
  minPhpVersion: "",
  minWpVersion: "",
  testedUpTo: "",
  productLogo: "",
  productBanner: "",
  featuredImage: "",
  supportedPlatforms: "wordpress",
  supportedPhpVersions: "",
  supportedWpVersions: "",
  dependencies: "",
  defaultReleaseChannel: "stable",
  stableBranch: "main",
  betaEnabled: false,
  alphaEnabled: false,
  downloadEnabled: true,
  publicDownloadDisabled: false,
  licenseRequired: true,
  productUrl: "",
  metaTitle: "",
  metaDescription: "",
};

function productDefaults(existing) {
  if (!existing) return lifecycleDefaults;
  const toLines = (items) => (Array.isArray(items) ? items.join("\n") : "");
  return {
    ...lifecycleDefaults,
    ...existing,
    supportedPlatforms: toLines(existing.supportedPlatforms),
    supportedPhpVersions: toLines(existing.supportedPhpVersions),
    supportedWpVersions: toLines(existing.supportedWpVersions),
    dependencies: toLines(existing.dependencies),
    currency: existing.currency || "USD",
    status: existing.status || "active",
    defaultReleaseChannel: existing.defaultReleaseChannel || "stable",
    licenseType: existing.licenseType || "single_site",
    stableBranch: existing.stableBranch || "main",
  };
}

const fetchProducts = (filters) => {
  const params = new URLSearchParams({ limit: "50" });
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return api.get(`/products?${params.toString()}`).then((r) => r.data);
};

function titleize(value) {
  return value ? value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "-";
}

function Stat({ label, value }) {
  return (
    <div className="min-w-[92px]">
      <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{value ?? 0}</p>
    </div>
  );
}

function CheckboxField({ register, name, label }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-600">
      <input type="checkbox" {...register(name)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
      {label}
    </label>
  );
}

function ProductModal({ existing, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!existing;
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(productSchema),
    defaultValues: productDefaults(existing),
  });

  const onSubmit = async (values) => {
    try {
      if (isEdit) await api.patch(`/products/${existing._id}`, values);
      else await api.post("/products", values);
      toast.success(isEdit ? "Product updated." : "Product created.");
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || "Error saving product.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl w-full max-w-4xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{isEdit ? "Edit Product" : "New Product"}</h2>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Product name" error={errors.name?.message} required>
              <Input {...register("name")} placeholder="SEO Pro Plugin" error={errors.name} />
            </FormField>
            <FormField label="Slug" error={errors.slug?.message}>
              <Input {...register("slug")} placeholder="seo-pro-plugin" error={errors.slug} />
            </FormField>
            <FormField label="Internal code" error={errors.internalProductCode?.message}>
              <Input {...register("internalProductCode")} placeholder="SEO-PRO" error={errors.internalProductCode} />
            </FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Short description" error={errors.shortDescription?.message}>
              <textarea {...register("shortDescription")} rows={3} className="input resize-none" />
            </FormField>
            <FormField label="Description" error={errors.description?.message}>
              <textarea {...register("description")} rows={3} className="input resize-none" />
            </FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <FormField label="Status" error={errors.status?.message} required>
              <select {...register("status")} className="input">
                {PRODUCT_STATUSES.map((status) => <option key={status} value={status}>{titleize(status)}</option>)}
              </select>
            </FormField>
            <FormField label="Release channel" error={errors.defaultReleaseChannel?.message} required>
              <select {...register("defaultReleaseChannel")} className="input">
                {RELEASE_CHANNELS.map((channel) => <option key={channel} value={channel}>{titleize(channel)}</option>)}
              </select>
            </FormField>
            <FormField label="Price" error={errors.price?.message} required>
              <Input {...register("price")} type="number" step="0.01" error={errors.price} />
            </FormField>
            <FormField label="Currency" error={errors.currency?.message} required>
              <Input {...register("currency")} maxLength={3} error={errors.currency} />
            </FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="License type" error={errors.licenseType?.message} required>
              <select {...register("licenseType")} className="input">
                {LICENSE_TYPES.map((type) => <option key={type} value={type}>{titleize(type)}</option>)}
              </select>
            </FormField>
            <FormField label="Stable branch" error={errors.stableBranch?.message}>
              <Input {...register("stableBranch")} error={errors.stableBranch} />
            </FormField>
            <div className="grid grid-cols-1 gap-2 pt-6">
              <CheckboxField register={register} name="renewalSupported" label="Renewals supported" />
              <CheckboxField register={register} name="upgradeSupported" label="Upgrades supported" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <CheckboxField register={register} name="lifetimeSupport" label="Lifetime support" />
            <CheckboxField register={register} name="lifetimeUpdates" label="Lifetime updates" />
            <CheckboxField register={register} name="betaEnabled" label="Beta enabled" />
            <CheckboxField register={register} name="alphaEnabled" label="Alpha enabled" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <FormField label="Plugin slug" error={errors.pluginSlug?.message}>
              <Input {...register("pluginSlug")} placeholder="seo-pro-plugin" error={errors.pluginSlug} />
            </FormField>
            <FormField label="Plugin folder" error={errors.pluginFolder?.message}>
              <Input {...register("pluginFolder")} placeholder="seo-pro-plugin" error={errors.pluginFolder} />
            </FormField>
            <FormField label="Main plugin file" error={errors.mainPluginFile?.message}>
              <Input {...register("mainPluginFile")} placeholder="seo-pro-plugin.php" error={errors.mainPluginFile} />
            </FormField>
            <FormField label="Text domain" error={errors.textDomain?.message}>
              <Input {...register("textDomain")} placeholder="seo-pro-plugin" error={errors.textDomain} />
            </FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Minimum PHP" error={errors.minPhpVersion?.message}>
              <Input {...register("minPhpVersion")} placeholder="8.0" error={errors.minPhpVersion} />
            </FormField>
            <FormField label="Minimum WordPress" error={errors.minWpVersion?.message}>
              <Input {...register("minWpVersion")} placeholder="6.0" error={errors.minWpVersion} />
            </FormField>
            <FormField label="Tested up to" error={errors.testedUpTo?.message}>
              <Input {...register("testedUpTo")} placeholder="6.6" error={errors.testedUpTo} />
            </FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Product logo URL" error={errors.productLogo?.message}>
              <Input {...register("productLogo")} error={errors.productLogo} />
            </FormField>
            <FormField label="Product banner URL" error={errors.productBanner?.message}>
              <Input {...register("productBanner")} error={errors.productBanner} />
            </FormField>
            <FormField label="Featured image URL" error={errors.featuredImage?.message}>
              <Input {...register("featuredImage")} error={errors.featuredImage} />
            </FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <FormField label="Platforms" error={errors.supportedPlatforms?.message}>
              <textarea {...register("supportedPlatforms")} rows={3} className="input resize-none" />
            </FormField>
            <FormField label="PHP versions" error={errors.supportedPhpVersions?.message}>
              <textarea {...register("supportedPhpVersions")} rows={3} className="input resize-none" />
            </FormField>
            <FormField label="WP versions" error={errors.supportedWpVersions?.message}>
              <textarea {...register("supportedWpVersions")} rows={3} className="input resize-none" />
            </FormField>
            <FormField label="Dependencies" error={errors.dependencies?.message}>
              <textarea {...register("dependencies")} rows={3} className="input resize-none" />
            </FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <CheckboxField register={register} name="downloadEnabled" label="Downloads enabled" />
            <CheckboxField register={register} name="publicDownloadDisabled" label="Disable public downloads" />
            <CheckboxField register={register} name="licenseRequired" label="License required" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Product URL" error={errors.productUrl?.message}>
              <Input {...register("productUrl")} error={errors.productUrl} />
            </FormField>
            <FormField label="Meta title" error={errors.metaTitle?.message}>
              <Input {...register("metaTitle")} error={errors.metaTitle} />
            </FormField>
            <FormField label="Meta description" error={errors.metaDescription?.message}>
              <Input {...register("metaDescription")} error={errors.metaDescription} />
            </FormField>
          </div>

          <div className="flex gap-3 pt-2 border-t border-gray-100">
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

function PlanModal({ productId, existing, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!existing;
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(planSchema),
    defaultValues: existing || { renewalType: "recurring", durationDays: 365, planType: "single_site", upgradeRank: 1 },
  });

  const onSubmit = async (values) => {
    try {
      if (isEdit) await api.patch(`/products/${productId}/plans/${existing._id}`, values);
      else await api.post(`/products/${productId}/plans`, values);
      toast.success(isEdit ? "Plan updated." : "Plan created.");
      qc.invalidateQueries({ queryKey: ["admin-products"] });
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
            <Input {...register("name")} placeholder="Single Site" error={errors.name} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Price USD" error={errors.priceUSD?.message} required>
              <Input {...register("priceUSD")} type="number" step="0.01" error={errors.priceUSD} />
            </FormField>
            <FormField label="Price local" error={errors.priceLocal?.message} required>
              <Input {...register("priceLocal")} type="number" error={errors.priceLocal} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Allowed sites" error={errors.allowedSites?.message} required>
              <Input {...register("allowedSites")} type="number" error={errors.allowedSites} />
            </FormField>
            <FormField label="Plan type" error={errors.planType?.message}>
              <select {...register("planType")} className="input">
                {["single_site", "3_sites", "5_sites", "10_sites", "agency", "unlimited", "lifetime", "trial", "custom"].map((type) => (
                  <option key={type} value={type}>{type.replace(/_/g, " ")}</option>
                ))}
              </select>
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Upgrade rank" error={errors.upgradeRank?.message}>
              <Input {...register("upgradeRank")} type="number" error={errors.upgradeRank} />
            </FormField>
            <FormField label="Duration days" error={errors.durationDays?.message}>
              <Input {...register("durationDays")} type="number" error={errors.durationDays} />
            </FormField>
          </div>
          <FormField label="Renewal type" error={errors.renewalType?.message} required>
            <select {...register("renewalType")} className="input">
              <option value="recurring">Recurring</option>
              <option value="one-time">One-time</option>
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

function ProductRow({ product }) {
  const [expanded, setExpanded] = useState(false);
  const [productModal, setProductModal] = useState(null);
  const [planModal, setPlanModal] = useState(null);
  const qc = useQueryClient();

  const archiveMutation = useMutation({
    mutationFn: () => api.delete(`/products/${product._id}`),
    onSuccess: () => { toast.success("Product archived."); qc.invalidateQueries({ queryKey: ["admin-products"] }); },
    onError: (err) => toast.error(err.response?.data?.message || "Error archiving product."),
  });

  const deactivatePlan = useMutation({
    mutationFn: (planId) => api.delete(`/products/${product._id}/plans/${planId}`),
    onSuccess: () => { toast.success("Plan deactivated."); qc.invalidateQueries({ queryKey: ["admin-products"] }); },
    onError: (err) => toast.error(err.response?.data?.message || "Error."),
  });

  const isPublic = product.status === "active" || product.status === "published";

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
        <div className="p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 bg-brand-50 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
              {product.productLogo ? (
                <img src={product.productLogo} alt="" className="w-full h-full object-cover" />
              ) : (
                <Package className="w-5 h-5 text-brand-600" />
              )}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-gray-900 truncate">{product.name}</p>
              <p className="text-xs text-gray-400 truncate">
                {product.slug || "-"} {product.internalProductCode ? `- ${product.internalProductCode}` : ""}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 flex-1 lg:max-w-3xl">
            <Stat label="Latest" value={product.latestVersion?.versionNumber || "-"} />
            <Stat label="Licenses" value={product.activeLicenseCount} />
            <Stat label="Downloads" value={product.downloadCount} />
            <Stat label="Channel" value={titleize(product.defaultReleaseChannel)} />
            <Stat label="Plans" value={product.plans?.length || 0} />
          </div>

          <div className="flex items-center gap-2 ml-auto flex-shrink-0">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              isPublic ? "bg-green-50 text-green-700" : product.status === "archived" ? "bg-gray-100 text-gray-500" : "bg-amber-50 text-amber-700"
            }`}>
              {titleize(product.status)}
            </span>
            <button onClick={() => setProductModal(product)} className="p-1.5 hover:bg-gray-100 rounded-lg" title="Edit">
              <Edit2 className="w-4 h-4 text-gray-500" />
            </button>
            <button onClick={() => archiveMutation.mutate()} className="p-1.5 hover:bg-red-50 rounded-lg" title="Archive">
              <Archive className="w-4 h-4 text-gray-400 hover:text-red-500" />
            </button>
            <button onClick={() => setExpanded((v) => !v)} className="p-1.5 hover:bg-gray-100 rounded-lg" title="Plans">
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
                        ${plan.priceUSD} USD - {plan.priceLocal?.toLocaleString()} local -{" "}
                        {plan.allowedSites === 0 ? "Unlimited" : plan.allowedSites} site{plan.allowedSites !== 1 ? "s" : ""} -{" "}
                        {plan.renewalType}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${plan.isActive ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"}`}>
                        {plan.isActive ? "active" : "inactive"}
                      </span>
                      <button onClick={() => setPlanModal(plan)} className="p-1 hover:bg-white rounded" title="Edit plan">
                        <Edit2 className="w-3 h-3 text-gray-400" />
                      </button>
                      {plan.isActive && (
                        <button onClick={() => deactivatePlan.mutate(plan._id)} className="p-1 hover:bg-red-50 rounded" title="Archive plan">
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

export default function AdminProductsPage() {
  const [showModal, setShowModal] = useState(false);
  const [filters, setFilters] = useState({ search: "", status: "", releaseChannel: "", published: "", archived: "" });

  const queryFilters = useMemo(() => filters, [filters]);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-products", queryFilters],
    queryFn: () => fetchProducts(queryFilters),
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
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Products & Plans</h1>
            <p className="text-sm text-gray-500 mt-0.5">{products.length} product{products.length !== 1 ? "s" : ""}</p>
          </div>
          <Button onClick={() => setShowModal(true)}>
            <Plus className="w-4 h-4" /> New product
          </Button>
        </div>

        <div className="card p-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="md:col-span-2 relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={filters.search}
                onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Search name, slug, or code"
                className="pl-9"
              />
            </div>
            <select
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value, published: "", archived: "" }))}
              className="input"
            >
              <option value="">All statuses</option>
              {PRODUCT_STATUSES.map((status) => <option key={status} value={status}>{titleize(status)}</option>)}
            </select>
            <select
              value={filters.releaseChannel}
              onChange={(event) => setFilters((current) => ({ ...current, releaseChannel: event.target.value }))}
              className="input"
            >
              <option value="">All channels</option>
              {RELEASE_CHANNELS.map((channel) => <option key={channel} value={channel}>{titleize(channel)}</option>)}
            </select>
            <select
              value={filters.published || filters.archived}
              onChange={(event) => {
                const value = event.target.value;
                setFilters((current) => ({
                  ...current,
                  status: "",
                  published: value === "published" ? "true" : "",
                  archived: value === "archived" ? "true" : "",
                }));
              }}
              className="input"
            >
              <option value="">Lifecycle view</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>
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
