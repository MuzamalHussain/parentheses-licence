import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import {
  Upload, Package, FileArchive, CheckCircle, RotateCcw, Trash2,
  Loader2, X, Tag, Calendar, HardDrive, Hash, Search, Edit2, ShieldCheck
} from "lucide-react";
import api from "../../lib/api";
import { Button, Input, FormField, Alert } from "../../components/ui";
import {
  useAdminVersions, useUploadVersion, useVersionAction, useDeleteVersion, useUpdateVersion
} from "../../hooks/useVersions";

const VERSION_STATUSES = ["draft", "published", "hidden", "archived", "deprecated"];
const RELEASE_CHANNELS = ["stable", "release_candidate", "beta", "alpha", "internal", "deprecated"];
const CHANGELOG_FIELDS = [
  ["newFeatures", "New features"],
  ["improvements", "Improvements"],
  ["bugFixes", "Bug fixes"],
  ["securityFixes", "Security fixes"],
  ["breakingChanges", "Breaking changes"],
  ["developerNotes", "Developer notes"],
];

function formatBytes(bytes) {
  if (!bytes) return "-";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

function titleize(value) {
  return value ? value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "-";
}

function versionDefaults(version = {}) {
  return {
    versionName: version.versionName || "",
    status: version.status || (version.isPublished ? "published" : "draft"),
    releaseChannel: version.releaseChannel || "stable",
    description: version.description || "",
    changelog: version.changelog || "",
    releaseNotes: version.releaseNotes || "",
    minWpVersion: version.minWpVersion || "",
    minPhpVersion: version.minPhpVersion || "",
    testedUpTo: version.testedUpTo || "",
    pluginSlug: version.pluginSlug || "",
    releaseDate: version.releaseDate ? new Date(version.releaseDate).toISOString().slice(0, 10) : "",
    newFeatures: version.changelogSections?.newFeatures || "",
    improvements: version.changelogSections?.improvements || "",
    bugFixes: version.changelogSections?.bugFixes || "",
    securityFixes: version.changelogSections?.securityFixes || "",
    breakingChanges: version.changelogSections?.breakingChanges || "",
    developerNotes: version.changelogSections?.developerNotes || "",
  };
}

function appendVersionForm(formData, values) {
  for (const [key, value] of Object.entries(values)) {
    formData.append(key, value || "");
  }
}

function UploadModal({ productId, onClose }) {
  const { mutateAsync, isPending } = useUploadVersion(productId);
  const [file, setFile] = useState(null);
  const [serverError, setServerError] = useState("");
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      versionNumber: "",
      versionName: "",
      status: "draft",
      releaseChannel: "stable",
      releaseDate: "",
      description: "",
      changelog: "",
      releaseNotes: "",
      minWpVersion: "",
      minPhpVersion: "",
      testedUpTo: "",
      ...Object.fromEntries(CHANGELOG_FIELDS.map(([key]) => [key, ""])),
    },
  });

  const onSubmit = async (values) => {
    setServerError("");
    if (!file) { setServerError("Please select a .zip file."); return; }

    const formData = new FormData();
    formData.append("file", file);
    appendVersionForm(formData, values);

    try {
      await mutateAsync(formData);
      onClose();
    } catch (err) {
      setServerError(err.response?.data?.message || "Upload failed.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl w-full max-w-4xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Upload New Version</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5 overflow-y-auto">
          <Alert type="error" message={serverError} />

          <FormField label="Plugin .zip file" required>
            <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg py-8 cursor-pointer transition-colors ${
              file ? "border-brand-400 bg-brand-50" : "border-gray-300 hover:border-brand-400 hover:bg-gray-50"
            }`}>
              <input type="file" accept=".zip" className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)} />
              {file ? (
                <>
                  <FileArchive className="w-8 h-8 text-brand-600" />
                  <span className="text-sm font-medium text-gray-700">{file.name}</span>
                  <span className="text-xs text-gray-400">{formatBytes(file.size)}</span>
                </>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-gray-400" />
                  <span className="text-sm text-gray-500">Click to select a .zip file</span>
                  <span className="text-xs text-gray-400">Max 100MB</span>
                </>
              )}
            </label>
          </FormField>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <FormField label="Version number" error={errors.versionNumber?.message} required>
              <Input {...register("versionNumber", { required: "Version is required", pattern: { value: /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/, message: "Use semver, e.g. 1.4.2" } })}
                placeholder="1.4.2" error={errors.versionNumber} />
            </FormField>
            <FormField label="Version name">
              <Input {...register("versionName")} placeholder="Spring release" />
            </FormField>
            <FormField label="Status">
              <select {...register("status")} className="input">
                {VERSION_STATUSES.map((status) => <option key={status} value={status}>{titleize(status)}</option>)}
              </select>
            </FormField>
            <FormField label="Channel">
              <select {...register("releaseChannel")} className="input">
                {RELEASE_CHANNELS.map((channel) => <option key={channel} value={channel}>{titleize(channel)}</option>)}
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <FormField label="Release date">
              <Input {...register("releaseDate")} type="date" />
            </FormField>
            <FormField label="Min WordPress">
              <Input {...register("minWpVersion")} placeholder="6.0" />
            </FormField>
            <FormField label="Min PHP">
              <Input {...register("minPhpVersion")} placeholder="8.0" />
            </FormField>
            <FormField label="Tested up to">
              <Input {...register("testedUpTo")} placeholder="6.6" />
            </FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField label="Description">
              <textarea {...register("description")} rows={3} className="input resize-none" />
            </FormField>
            <FormField label="Release notes">
              <textarea {...register("releaseNotes")} rows={3} className="input resize-none" />
            </FormField>
          </div>

          <FormField label="Changelog summary">
            <textarea {...register("changelog")} rows={3} className="input resize-none" />
          </FormField>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {CHANGELOG_FIELDS.map(([key, label]) => (
              <FormField key={key} label={label}>
                <textarea {...register(key)} rows={2} className="input resize-none" />
              </FormField>
            ))}
          </div>

          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={isPending} className="flex-1">Upload version</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditVersionModal({ productId, version, onClose }) {
  const update = useUpdateVersion(productId);
  const { register, handleSubmit } = useForm({ defaultValues: versionDefaults(version) });

  const onSubmit = async (values) => {
    await update.mutateAsync({
      id: version._id,
      values: {
        ...values,
        releaseDate: values.releaseDate || undefined,
      },
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Edit Version {version.versionNumber}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <FormField label="Version name"><Input {...register("versionName")} /></FormField>
            <FormField label="Status">
              <select {...register("status")} className="input">
                {VERSION_STATUSES.map((status) => <option key={status} value={status}>{titleize(status)}</option>)}
              </select>
            </FormField>
            <FormField label="Channel">
              <select {...register("releaseChannel")} className="input">
                {RELEASE_CHANNELS.map((channel) => <option key={channel} value={channel}>{titleize(channel)}</option>)}
              </select>
            </FormField>
            <FormField label="Release date"><Input {...register("releaseDate")} type="date" /></FormField>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <FormField label="Plugin slug"><Input {...register("pluginSlug")} /></FormField>
            <FormField label="Min WordPress"><Input {...register("minWpVersion")} /></FormField>
            <FormField label="Min PHP"><Input {...register("minPhpVersion")} /></FormField>
            <FormField label="Tested up to"><Input {...register("testedUpTo")} /></FormField>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField label="Description"><textarea {...register("description")} rows={3} className="input resize-none" /></FormField>
            <FormField label="Release notes"><textarea {...register("releaseNotes")} rows={3} className="input resize-none" /></FormField>
          </div>
          <FormField label="Changelog summary"><textarea {...register("changelog")} rows={3} className="input resize-none" /></FormField>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {CHANGELOG_FIELDS.map(([key, label]) => (
              <FormField key={key} label={label}>
                <textarea {...register(key)} rows={2} className="input resize-none" />
              </FormField>
            ))}
          </div>
          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={update.isPending} className="flex-1">Save changes</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function VersionRow({ version, productId }) {
  const action = useVersionAction(productId);
  const del = useDeleteVersion(productId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const status = version.status || (version.isPublished ? "published" : "draft");

  return (
    <>
      {editing && <EditVersionModal productId={productId} version={version} onClose={() => setEditing(false)} />}
      <div className={`card p-4 ${version.isLatest ? "ring-2 ring-brand-200" : ""}`}>
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-gray-900">v{version.versionNumber}</span>
              {version.versionName && <span className="text-sm text-gray-500">{version.versionName}</span>}
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status === "published" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                {titleize(status)}
              </span>
              <span className="text-xs font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                {titleize(version.releaseChannel)}
              </span>
              {version.isLatest && <span className="text-xs font-medium bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">Latest</span>}
            </div>
            {(version.description || version.changelog) && (
              <p className="text-sm text-gray-500 mt-1 whitespace-pre-wrap">{version.description || version.changelog}</p>
            )}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {version.releaseDate || version.releasedAt ? new Date(version.releaseDate || version.releasedAt).toLocaleDateString() : "-"}</span>
              <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" /> {formatBytes(version.fileSizeBytes)}</span>
              <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> {version.downloadCount || 0} downloads</span>
              <span className="flex items-center gap-1"><Tag className="w-3 h-3" /> WP {version.minWpVersion || "-"} / PHP {version.minPhpVersion || "-"}</span>
              <span className="flex items-center gap-1"><Tag className="w-3 h-3" /> Tested {version.testedUpTo || "-"}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-400">
              {version.pluginSlug && <span>Slug {version.pluginSlug}</span>}
              {version.checksum && <span className="flex items-center gap-1 font-mono" title={version.checksum}><Hash className="w-3 h-3" /> SHA {version.checksum.slice(0, 8)}...</span>}
              {version.checksumMd5 && <span className="font-mono" title={version.checksumMd5}>MD5 {version.checksumMd5.slice(0, 8)}...</span>}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={() => setEditing(true)}
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700" title="Edit">
              <Edit2 className="w-4 h-4" />
            </button>
            {!version.isPublished ? (
              <button onClick={() => action.mutate({ id: version._id, action: "publish" })}
                disabled={action.isPending}
                className="p-1.5 hover:bg-green-50 rounded-lg text-gray-400 hover:text-green-600" title="Publish">
                <CheckCircle className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={() => action.mutate({ id: version._id, action: "unpublish" })}
                disabled={action.isPending}
                className="p-1.5 hover:bg-yellow-50 rounded-lg text-gray-400 hover:text-yellow-600" title="Unpublish">
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            {!version.isPublished && (
              confirmDelete ? (
                <div className="flex items-center gap-1">
                  <button onClick={() => del.mutate(version._id)} disabled={del.isPending}
                    className="text-xs bg-red-600 text-white px-2 py-1 rounded-md hover:bg-red-700">
                    Confirm
                  </button>
                  <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400 px-1">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)}
                  className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500" title="Delete">
                  <Trash2 className="w-4 h-4" />
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function AdminDownloads() {
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [filters, setFilters] = useState({ search: "", status: "", releaseChannel: "", latest: "" });

  useEffect(() => {
    api.get("/products?limit=50").then((r) => {
      setProducts(r.data.data || []);
      if (r.data.data?.length) setProductId(r.data.data[0]._id);
    });
  }, []);

  const queryFilters = useMemo(() => ({
    search: filters.search || undefined,
    status: filters.status || undefined,
    releaseChannel: filters.releaseChannel || undefined,
    latest: filters.latest || undefined,
  }), [filters]);
  const { data: versions, isLoading } = useAdminVersions(productId, queryFilters);

  return (
    <>
      {showUpload && <UploadModal productId={productId} onClose={() => setShowUpload(false)} />}

      <div className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Plugin Versions</h1>
            <p className="text-sm text-gray-500 mt-0.5">Upload and publish releases for your products</p>
          </div>
          <Button onClick={() => setShowUpload(true)} disabled={!productId}>
            <Upload className="w-4 h-4" /> Upload version
          </Button>
        </div>

        <div className="card p-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>
              {products.length === 0 && <option value="">No products yet</option>}
              {products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
            <div className="relative md:col-span-2">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={filters.search}
                onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Search version or channel"
                className="pl-9"
              />
            </div>
            <select className="input" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
              <option value="">All statuses</option>
              {VERSION_STATUSES.map((status) => <option key={status} value={status}>{titleize(status)}</option>)}
            </select>
            <select className="input" value={filters.releaseChannel} onChange={(event) => setFilters((current) => ({ ...current, releaseChannel: event.target.value }))}>
              <option value="">All channels</option>
              {RELEASE_CHANNELS.map((channel) => <option key={channel} value={channel}>{titleize(channel)}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 mt-3 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={filters.latest === "true"}
              onChange={(event) => setFilters((current) => ({ ...current, latest: event.target.checked ? "true" : "" }))}
              className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            Latest only
          </label>
        </div>

        {!productId ? (
          <div className="card p-12 text-center">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No products found</p>
            <p className="text-sm text-gray-400 mt-1">Create a product first under Products &amp; Plans.</p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
          </div>
        ) : versions?.length === 0 ? (
          <div className="card p-12 text-center">
            <FileArchive className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No versions uploaded yet</p>
            <p className="text-sm text-gray-400 mt-1">Upload your first .zip to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {versions.map((v) => <VersionRow key={v._id} version={v} productId={productId} />)}
          </div>
        )}
      </div>
    </>
  );
}
