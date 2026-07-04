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
