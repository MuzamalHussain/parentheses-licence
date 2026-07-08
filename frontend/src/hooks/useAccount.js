import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import { AUTH_SESSION_EXPIRED_EVENT, clearAuthSession } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";

export const useProfile = () =>
  useQuery({
    queryKey: ["account-profile"],
    queryFn: () => api.get("/account/profile").then((r) => r.data.data),
    staleTime: 30_000,
  });

export const useUpdateProfile = () => {
  const qc = useQueryClient();
  const { updateUser } = useAuth();

  return useMutation({
    mutationFn: (payload) => api.patch("/account/profile", payload).then((r) => r.data.data),
    onSuccess: (profile) => {
      updateUser(profile);
      qc.setQueryData(["account-profile"], profile);
      qc.invalidateQueries({ queryKey: ["account-profile"] });
    },
  });
};

export const useOrganizations = () =>
  useQuery({
    queryKey: ["organizations"],
    queryFn: () => api.get("/organizations").then((r) => r.data.data),
    staleTime: 30_000,
  });

export const useOrganizationDashboard = (organizationId) =>
  useQuery({
    queryKey: ["organization-dashboard", organizationId],
    queryFn: () => api.get(`/organizations/${organizationId}/dashboard`).then((r) => r.data.data),
    enabled: Boolean(organizationId),
    staleTime: 30_000,
  });

export const useOrganizationAction = () => {
  const qc = useQueryClient();
  const { updateUser } = useAuth();
  return useMutation({
    mutationFn: ({ action, organizationId, userId, invitationId, body = {} }) => {
      if (action === "create") return api.post("/organizations", body).then((r) => r.data);
      if (action === "switch") return api.post(`/organizations/${organizationId}/switch`).then((r) => r.data);
      if (action === "settings") return api.patch(`/organizations/${organizationId}/settings`, body).then((r) => r.data);
      if (action === "invite") return api.post(`/organizations/${organizationId}/invitations`, body).then((r) => r.data);
      if (action === "resend" || action === "cancel") return api.post(`/organizations/${organizationId}/invitations/${invitationId}/${action}`).then((r) => r.data);
      if (action === "role") return api.patch(`/organizations/${organizationId}/members/${userId}/role`, body).then((r) => r.data);
      if (action === "suspend") return api.post(`/organizations/${organizationId}/members/${userId}/suspend`).then((r) => r.data);
      if (action === "remove") return api.delete(`/organizations/${organizationId}/members/${userId}`).then((r) => r.data);
      if (action === "transfer") return api.post(`/organizations/${organizationId}/transfer-ownership`, body).then((r) => r.data);
      throw new Error("Unknown organization action.");
    },
    onSuccess: (result, vars) => {
      toast.success("Organization updated.");
      if (vars.action === "switch") updateUser({ activeOrganizationId: result.data.organization._id });
      qc.invalidateQueries({ queryKey: ["organizations"] });
      qc.invalidateQueries({ queryKey: ["organization-dashboard"] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Organization action failed."),
  });
};

export const useOrganizationBrand = (organizationId) =>
  useQuery({
    queryKey: ["organization-brand", organizationId],
    queryFn: () => api.get(`/brands/${organizationId}`).then((r) => r.data.data),
    enabled: Boolean(organizationId),
    staleTime: 30_000,
  });

export const usePublicBrand = (organizationId) =>
  useQuery({
    queryKey: ["public-brand", organizationId],
    queryFn: () => api.get("/brands/public", { params: { organizationId } }).then((r) => r.data.data),
    staleTime: 60_000,
  });

export const useBrandAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, organizationId, field, body = {} }) => {
      if (action === "asset") return api.patch(`/brands/${organizationId}/assets/${field}`, body).then((r) => r.data);
      if (action === "reset") return api.post(`/brands/${organizationId}/reset`).then((r) => r.data);
      return api.patch(`/brands/${organizationId}`, body).then((r) => r.data);
    },
    onSuccess: (_, vars) => {
      toast.success("Brand updated.");
      qc.invalidateQueries({ queryKey: ["organization-brand", vars.organizationId] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Brand update failed."),
  });
};

export const useChangePassword = () =>
  useMutation({
    mutationFn: (payload) => api.post("/account/change-password", payload).then((r) => r.data),
  });

export const useAccountSessions = () =>
  useQuery({
    queryKey: ["account-sessions"],
    queryFn: () => api.get("/account/sessions").then((r) => r.data.data),
    staleTime: 15_000,
  });

export const useAccountSecurityEvents = () =>
  useQuery({
    queryKey: ["account-security-events"],
    queryFn: () => api.get("/account/security-events").then((r) => r.data.data),
    staleTime: 15_000,
  });

function clearLocalAuthAfterSessionLogout() {
  clearAuthSession();
  window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
}

export const useRevokeAccountSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId) => api.delete(`/account/sessions/${sessionId}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["account-sessions"] });
      qc.invalidateQueries({ queryKey: ["account-security-events"] });
    },
  });
};

export const useLogoutCurrentSession = () =>
  useMutation({
    mutationFn: () => api.delete("/account/sessions/current").then((r) => r.data),
    onSuccess: clearLocalAuthAfterSessionLogout,
  });

export const useLogoutOtherSessions = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete("/account/sessions/others").then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["account-sessions"] });
      qc.invalidateQueries({ queryKey: ["account-security-events"] });
    },
  });
};

export const useLogoutAllSessions = () =>
  useMutation({
    mutationFn: () => api.delete("/account/sessions/all").then((r) => r.data),
    onSuccess: clearLocalAuthAfterSessionLogout,
  });
