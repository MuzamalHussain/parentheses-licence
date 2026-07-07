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

export const useAdminAnalytics = (scope = "executive", params = {}) =>
  useQuery({
    queryKey: ["admin-analytics", scope, params],
    queryFn: () => api.get(`/admin/analytics/${scope}`, { params }).then((r) => r.data.data),
    staleTime: 60_000,
  });

export const useAdminWorkflowOverview = () =>
  useQuery({
    queryKey: ["admin-workflows-overview"],
    queryFn: () => api.get("/admin/workflows/overview").then((r) => r.data.data),
    staleTime: 30_000,
  });

export const useAdminWorkflowJobs = (params = {}) =>
  useQuery({
    queryKey: ["admin-workflow-jobs", params],
    queryFn: () => api.get("/admin/workflows/jobs", { params }).then((r) => r.data.data),
    keepPreviousData: true,
  });

export const useAdminOperationsDashboard = (params = {}) =>
  useQuery({
    queryKey: ["admin-operations-dashboard", params],
    queryFn: () => api.get("/admin/operations/dashboard", { params }).then((r) => r.data.data),
    staleTime: 30_000,
  });

export const useOperationsAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, body = {} }) =>
      api.post(`/admin/operations/maintenance/${action}`, body).then((r) => r.data),
    onSuccess: () => {
      toast.success("Operation completed.");
      qc.invalidateQueries({ queryKey: ["admin-operations-dashboard"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
      qc.invalidateQueries({ queryKey: ["admin-workflows-overview"] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Operation failed."),
  });
};

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

export const useAdminLicenseSites = (id, enabled = true) =>
  useQuery({
    queryKey: ["admin-license-sites", id],
    queryFn: () => api.get(`/admin/licenses/${id}/sites`).then((r) => r.data.data),
    enabled: !!id && enabled,
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
        activate: "License activated.",
        expire: "License expired.",
        cancel: "License cancelled.",
        renew: "License renewed.",
        transfer: "License transferred.",
        "change-plan": "License plan changed.",
        "extend-expiration": "Expiration extended.",
        "convert-trial": "Trial converted.",
        "convert-lifetime": "License converted to lifetime.",
        "manual-activate": "Domain manually activated.",
        "force-deactivate": "Domain force deactivated.",
        "site-action": "Site action completed.",
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

export const useMyLicenseSites = (id, enabled = true) =>
  useQuery({
    queryKey: ["my-license-sites", id],
    queryFn: () => api.get(`/licenses/${id}/sites`).then((r) => r.data.data),
    enabled: !!id && enabled,
  });

export const useRenameSite = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ licenseId, domain, siteName }) =>
      api.post(`/licenses/${licenseId}/rename-site`, { domain, siteName }).then((r) => r.data),
    onSuccess: (_, { licenseId }) => {
      toast.success("Site renamed.");
      qc.invalidateQueries({ queryKey: ["my-license-sites", licenseId] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Failed to rename site."),
  });
};

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
