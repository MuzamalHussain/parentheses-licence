import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import { AUTH_SESSION_EXPIRED_EVENT, clearAuthSession } from "../lib/api";
import { useAuth } from "../context/AuthContext";

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
