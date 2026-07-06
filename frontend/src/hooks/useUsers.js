import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import toast from "react-hot-toast";

export const useAdminUsers = (params = {}) =>
  useQuery({
    queryKey: ["admin-users", params],
    queryFn: () => api.get("/admin/users", { params }).then((r) => r.data),
    keepPreviousData: true,
  });

export const useAdminUser = (id) =>
  useQuery({
    queryKey: ["admin-user", id],
    queryFn: () => api.get(`/admin/users/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });

export const useAdminUserOverview = (id) =>
  useQuery({
    queryKey: ["admin-user-overview", id],
    queryFn: () => api.get(`/admin/users/${id}/overview`).then((r) => r.data.data),
    enabled: !!id,
  });

export const useAdminUserLicenses = (id, params = {}) =>
  useQuery({
    queryKey: ["admin-user-licenses", id, params],
    queryFn: () => api.get(`/admin/users/${id}/licenses`, { params }).then((r) => r.data),
    enabled: !!id,
    keepPreviousData: true,
  });

export const useAdminUserOrders = (id, params = {}) =>
  useQuery({
    queryKey: ["admin-user-orders", id, params],
    queryFn: () => api.get(`/admin/users/${id}/orders`, { params }).then((r) => r.data),
    enabled: !!id,
    keepPreviousData: true,
  });

export const useAdminUserDownloads = (id, params = {}) =>
  useQuery({
    queryKey: ["admin-user-downloads", id, params],
    queryFn: () => api.get(`/admin/users/${id}/downloads`, { params }).then((r) => r.data),
    enabled: !!id,
    keepPreviousData: true,
  });

export const useAdminUserDomains = (id, params = {}) =>
  useQuery({
    queryKey: ["admin-user-domains", id, params],
    queryFn: () => api.get(`/admin/users/${id}/domains`, { params }).then((r) => r.data),
    enabled: !!id,
    keepPreviousData: true,
  });

export const useAdminUserSupport = (id, params = {}) =>
  useQuery({
    queryKey: ["admin-user-support", id, params],
    queryFn: () => api.get(`/admin/users/${id}/support`, { params }).then((r) => r.data),
    enabled: !!id,
    keepPreviousData: true,
  });

export const useAdminUserAudit = (id, params = {}) =>
  useQuery({
    queryKey: ["admin-user-audit", id, params],
    queryFn: () => api.get(`/admin/users/${id}/audit`, { params }).then((r) => r.data),
    enabled: !!id,
    keepPreviousData: true,
  });

export const useAdminUserSecurity = (id) =>
  useQuery({
    queryKey: ["admin-user-security", id],
    queryFn: () => api.get(`/admin/users/${id}/security`).then((r) => r.data.data),
    enabled: !!id,
    staleTime: 15_000,
  });

function invalidateAdminUser(qc, id) {
  qc.invalidateQueries({ queryKey: ["admin-users"] });
  qc.invalidateQueries({ queryKey: ["admin-user"] });
  qc.invalidateQueries({ queryKey: ["admin-user-overview", id] });
  qc.invalidateQueries({ queryKey: ["admin-user-audit"] });
  qc.invalidateQueries({ queryKey: ["admin-user-security", id] });
}

export const useUpdateAdminUserProfile = (id) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.patch(`/admin/users/${id}/profile`, payload).then((r) => r.data),
    onSuccess: () => {
      toast.success("Customer profile updated.");
      invalidateAdminUser(qc, id);
    },
    onError: (err) => toast.error(err.response?.data?.message || "Could not update customer profile."),
  });
};

export const useUpdateAdminUserStatus = (id) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action) => api.patch(`/admin/users/${id}/status`, { action }).then((r) => r.data),
    onSuccess: (res) => {
      toast.success(res.message || "Customer status updated.");
      invalidateAdminUser(qc, id);
    },
    onError: (err) => toast.error(err.response?.data?.message || "Could not update account status."),
  });
};

export const useUpdateAdminUserEmailVerification = (id) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (emailVerified) => api.patch(`/admin/users/${id}/email-verification`, { emailVerified }).then((r) => r.data),
    onSuccess: (res) => {
      toast.success(res.message || "Email verification updated.");
      invalidateAdminUser(qc, id);
    },
    onError: (err) => toast.error(err.response?.data?.message || "Could not update email verification."),
  });
};

export const useForceAdminUserPasswordReset = (id) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/admin/users/${id}/force-password-reset`).then((r) => r.data),
    onSuccess: (res) => {
      toast.success(res.message || "Password reset forced.");
      invalidateAdminUser(qc, id);
    },
    onError: (err) => toast.error(err.response?.data?.message || "Could not force password reset."),
  });
};

export const useSendAdminUserPasswordReset = (id) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/admin/users/${id}/send-password-reset`).then((r) => r.data),
    onSuccess: (res) => {
      toast.success(res.message || "Password reset email sent.");
      invalidateAdminUser(qc, id);
    },
    onError: (err) => toast.error(err.response?.data?.message || "Could not send password reset email."),
  });
};

export const useRevokeAdminUserSessions = (id) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/admin/users/${id}/revoke-sessions`).then((r) => r.data),
    onSuccess: (res) => {
      toast.success(res.message || "Sessions revoked.");
      invalidateAdminUser(qc, id);
    },
    onError: (err) => toast.error(err.response?.data?.message || "Could not revoke sessions."),
  });
};

export const useRevokeAdminUserSession = (id) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId) => api.delete(`/admin/users/${id}/sessions/${sessionId}`).then((r) => r.data),
    onSuccess: (res) => {
      toast.success(res.message || "Session terminated.");
      invalidateAdminUser(qc, id);
    },
    onError: (err) => toast.error(err.response?.data?.message || "Could not terminate session."),
  });
};

export const useAddAdminUserNote = (id) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.post(`/admin/users/${id}/notes`, { body }).then((r) => r.data),
    onSuccess: () => {
      toast.success("Internal note added.");
      invalidateAdminUser(qc, id);
    },
    onError: (err) => toast.error(err.response?.data?.message || "Could not add note."),
  });
};

export const useUpdateUserRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }) => api.patch(`/admin/users/${id}/role`, { role }).then((r) => r.data),
    onSuccess: () => {
      toast.success("Role updated.");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-user"] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Could not update role."),
  });
};

export const useToggleUserActive = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.patch(`/admin/users/${id}/toggle-active`).then((r) => r.data),
    onSuccess: (res) => {
      toast.success(res.message || "User status updated.");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-user"] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Could not update account status."),
  });
};
