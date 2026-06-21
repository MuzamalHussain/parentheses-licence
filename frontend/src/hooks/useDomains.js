import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import toast from "react-hot-toast";

export const useAdminDomains = (params = {}) =>
  useQuery({
    queryKey: ["admin-domains", params],
    queryFn: () => api.get("/admin/domains", { params }).then((r) => r.data),
    keepPreviousData: true,
  });

export const useAdminDomainStats = () =>
  useQuery({
    queryKey: ["admin-domain-stats"],
    queryFn: () => api.get("/admin/domains/stats").then((r) => r.data.data),
    staleTime: 30_000,
  });

export const useDomainHistory = (licenseId) =>
  useQuery({
    queryKey: ["domain-history", licenseId],
    queryFn: () => api.get(`/admin/domains/${licenseId}/history`).then((r) => r.data.data),
    enabled: !!licenseId,
  });

export const useForceDeactivateDomain = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ licenseId, domain }) =>
      api.post(`/admin/domains/${licenseId}/force-deactivate`, { domain }).then((r) => r.data),
    onSuccess: () => {
      toast.success("Domain force-deactivated.");
      qc.invalidateQueries({ queryKey: ["admin-domains"] });
      qc.invalidateQueries({ queryKey: ["admin-domain-stats"] });
      qc.invalidateQueries({ queryKey: ["admin-licenses"] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Failed to deactivate domain."),
  });
};
