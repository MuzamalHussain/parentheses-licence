import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import api from "../lib/api";

export const useAdminSettings = () =>
  useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => api.get("/admin/settings").then((r) => r.data.data),
  });

export const useFeatureFlags = () =>
  useQuery({
    queryKey: ["feature-flags"],
    queryFn: () => api.get("/admin/settings/feature-flags").then((r) => r.data.data),
  });

export const useUpdateSetting = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }) => api.patch(`/admin/settings/${encodeURIComponent(key)}`, { value }).then((r) => r.data),
    onSuccess: () => {
      toast.success("Setting saved.");
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Error saving setting."),
  });
};
