import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import {
  Upload, Package, FileArchive, CheckCircle, RotateCcw, Trash2,
  Loader2, X, Tag, Calendar, HardDrive, Hash
} from "lucide-react";
import api from "../../lib/api";
import { Button, Input, FormField, Alert } from "../../components/ui";
import {
  useAdminVersions, useUploadVersion, useVersionAction, useDeleteVersion
} from "../../hooks/useVersions";

function formatBytes(bytes) {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

// ── Upload Modal ───────────────────────────────────────────────────────────────
function UploadModal({ productId, onClose }) {
  const { mutateAsync, isPending } = useUploadVersion(productId);
  const [file, setFile] = useState(null);
  const [serverError, setServerError] = useState("");
  const { register, handleSubmit, formState: { errors } } = useForm();

  const onSubmit = async (values) => {
    setServerError("");
    if (!file) { setServerError("Please select a .zip file."); return; }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("versionNumber", values.versionNumber);
    formData.append("changelog", values.changelog || "");
    formData.append("minWpVersion", values.minWpVersion || "");
    formData.append("minPhpVersion", values.minPhpVersion || "");

    try {
      await mutateAsync(formData);
      onClose();
    } catch (err) {
      setServerError(err.response?.data?.message || "Upload failed.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Upload New Version</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <Alert type="error" message={serverError} />

          {/* File picker */}
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

          <FormField label="Version number" error={errors.versionNumber?.message} required>
            <Input {...register("versionNumber", { required: "Version is required", pattern: { value: /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/, message: "Use semver, e.g. 1.4.2" } })}
              placeholder="e.g. 1.4.2" error={errors.versionNumber} />
          </FormField>

          <FormField label="Changelog" error={errors.changelog?.message}>
            <textarea {...register("changelog")} rows={4} className="input resize-none"
              placeholder="What's new in this version..." />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Min WP version (optional)">
              <Input {...register("minWpVersion")} placeholder="e.g. 5.8" />
            </FormField>
            <FormField label="Min PHP version (optional)">
              <Input {...register("minPhpVersion")} placeholder="e.g. 7.4" />
            </FormField>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={isPending} className="flex-1">
              Upload version
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Version Row ───────────────────────────────────────────────────────────────
function VersionRow({ version, productId }) {
  const action = useVersionAction(productId);
  const del = useDeleteVersion(productId);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className={`card p-4 ${version.isPublished ? "ring-2 ring-brand-200" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-bold text-gray-900">v{version.versionNumber}</span>
            {version.isPublished && (
              <span className="text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                Live
              </span>
            )}
          </div>
          {version.changelog && (
            <p className="text-sm text-gray-500 mt-1 whitespace-pre-wrap">{version.changelog}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-400">
            <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" /> {formatBytes(version.fileSizeBytes)}</span>
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(version.createdAt).toLocaleDateString()}</span>
            {version.minWpVersion && <span className="flex items-center gap-1"><Tag className="w-3 h-3" /> WP {version.minWpVersion}+</span>}
            {version.checksum && <span className="flex items-center gap-1 font-mono" title={version.checksum}><Hash className="w-3 h-3" /> {version.checksum.slice(0, 8)}...</span>}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
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
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminDownloads() {
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState("");
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    api.get("/products?limit=50").then((r) => {
      setProducts(r.data.data || []);
      if (r.data.data?.length) setProductId(r.data.data[0]._id);
    });
  }, []);

  const { data: versions, isLoading } = useAdminVersions(productId);

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

        {/* Product selector */}
        <div className="max-w-xs">
          <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>
            {products.length === 0 && <option value="">No products yet</option>}
            {products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
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
