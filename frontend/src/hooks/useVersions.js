import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import toast from "react-hot-toast";

// ── Admin: Plugin Versions ────────────────────────────────────────────────────
export const useAdminVersions = (productId, filters = {}) =>
  useQuery({
    queryKey: ["admin-versions", productId, filters],
    queryFn: () => api.get(`/admin/products/${productId}/versions`, { params: filters }).then((r) => r.data.data),
    enabled: !!productId,
  });

export const useAdminDownloadHistory = (params = {}) =>
  useQuery({
    queryKey: ["admin-download-history", params],
    queryFn: () => api.get("/admin/downloads", { params }).then((r) => r.data),
    keepPreviousData: true,
  });

export const useUploadVersion = (productId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData) =>
      api.post(`/admin/products/${productId}/versions`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      }).then((r) => r.data),
    onSuccess: () => {
      toast.success("Version uploaded.");
      qc.invalidateQueries({ queryKey: ["admin-versions", productId] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Upload failed."),
  });
};

export const useUpdateVersion = (productId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }) =>
      api.patch(`/admin/products/${productId}/versions/${id}`, values).then((r) => r.data),
    onSuccess: () => {
      toast.success("Version updated.");
      qc.invalidateQueries({ queryKey: ["admin-versions", productId] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Update failed."),
  });
};

export const useVersionAction = (productId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }) =>
      api.post(`/admin/products/${productId}/versions/${id}/${action}`).then((r) => r.data),
    onSuccess: (_, { action }) => {
      const msgs = { publish: "Version published.", unpublish: "Version unpublished.", rollback: "Rolled back." };
      toast.success(msgs[action] || "Done.");
      qc.invalidateQueries({ queryKey: ["admin-versions", productId] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Action failed."),
  });
};

export const useDeleteVersion = (productId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/admin/products/${productId}/versions/${id}`).then((r) => r.data),
    onSuccess: () => {
      toast.success("Version deleted.");
      qc.invalidateQueries({ queryKey: ["admin-versions", productId] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Delete failed."),
  });
};

// ── Customer: Versions + Downloads ────────────────────────────────────────────
export const useProductVersions = (productId) =>
  useQuery({
    queryKey: ["product-versions", productId],
    queryFn: () => api.get(`/products/${productId}/versions`).then((r) => r.data.data),
    enabled: !!productId,
  });

export const useMyDownloadHistory = (params = {}) =>
  useQuery({
    queryKey: ["my-downloads", params],
    queryFn: () => api.get("/downloads/history", { params }).then((r) => r.data),
    keepPreviousData: true,
  });

export const useRequestDownload = () =>
  useMutation({
    mutationFn: ({ licenseId, pluginVersionId }) =>
      api.post("/downloads/request", { licenseId, pluginVersionId }).then((r) => r.data),
    onError: (err) => toast.error(err.response?.data?.message || "Could not start download."),
  });
