import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import toast from "react-hot-toast";

// ── Admin Dashboard ───────────────────────────────────────────────────────────
export const useAdminDashboard = () =>
  useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => api.get("/admin/dashboard").then((r) => r.data.data),
    staleTime: 60_000,
  });

// ── Admin Licenses ────────────────────────────────────────────────────────────
export const useAdminLicenses = (params = {}) =>
  useQuery({
    queryKey: ["admin-licenses", params],
    queryFn: () => api.get("/admin/licenses", { params }).then((r) => r.data),
    keepPreviousData: true,
  });

export const useAdminLicense = (id) =>
  useQuery({
    queryKey: ["admin-license", id],
    queryFn: () => api.get(`/admin/licenses/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });

export const useAdminLicenseStats = () =>
  useQuery({
    queryKey: ["admin-license-stats"],
    queryFn: () => api.get("/admin/licenses/stats").then((r) => r.data.data),
    staleTime: 30_000,
  });

export const useCreateLicense = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post("/admin/licenses", data).then((r) => r.data),
    onSuccess: () => {
      toast.success("License created.");
      qc.invalidateQueries({ queryKey: ["admin-licenses"] });
      qc.invalidateQueries({ queryKey: ["admin-license-stats"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Error creating license."),
  });
};

export const useLicenseAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, body = {} }) =>
      api.post(`/admin/licenses/${id}/${action}`, body).then((r) => r.data),
    onSuccess: (_, { action }) => {
      const msgs = {
        suspend: "License suspended.",
        reinstate: "License reinstated.",
        revoke: "License revoked.",
        "reset-activations": "Activations reset.",
      };
      toast.success(msgs[action] || "Done.");
      qc.invalidateQueries({ queryKey: ["admin-licenses"] });
      qc.invalidateQueries({ queryKey: ["admin-license-stats"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Action failed."),
  });
};

// ── Customer Licenses ─────────────────────────────────────────────────────────
export const useMyLicenses = (params = {}) =>
  useQuery({
    queryKey: ["my-licenses", params],
    queryFn: () => api.get("/licenses", { params }).then((r) => r.data),
    keepPreviousData: true,
  });

export const useMyLicense = (id) =>
  useQuery({
    queryKey: ["my-license", id],
    queryFn: () => api.get(`/licenses/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });

export const useMyLicenseSummary = () =>
  useQuery({
    queryKey: ["my-license-summary"],
    queryFn: () => api.get("/licenses/summary").then((r) => r.data.data),
    staleTime: 30_000,
  });

export const useDeactivateDomain = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ licenseId, domain }) =>
      api.post(`/licenses/${licenseId}/deactivate-domain`, { domain }).then((r) => r.data),
    onSuccess: () => {
      toast.success("Domain deactivated. Slot is now free.");
      qc.invalidateQueries({ queryKey: ["my-licenses"] });
      qc.invalidateQueries({ queryKey: ["my-license-summary"] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Failed to deactivate domain."),
  });
};
