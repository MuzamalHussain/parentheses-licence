import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
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
