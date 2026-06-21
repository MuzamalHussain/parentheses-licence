import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import toast from "react-hot-toast";

// ── Customer: Checkout + Orders ───────────────────────────────────────────────
export const useCreateCheckout = () =>
  useMutation({
    mutationFn: (payload) => api.post("/orders/checkout", payload).then((r) => r.data),
    onError: (err) => toast.error(err.response?.data?.message || "Could not start checkout."),
  });

export const useMyOrders = (params = {}) =>
  useQuery({
    queryKey: ["my-orders", params],
    queryFn: () => api.get("/orders", { params }).then((r) => r.data),
    keepPreviousData: true,
  });

export const useMyOrder = (id, opts = {}) =>
  useQuery({
    queryKey: ["my-order", id],
    queryFn: () => api.get(`/orders/${id}`).then((r) => r.data.data),
    enabled: !!id,
    ...opts,
  });

// ── Admin: Orders ──────────────────────────────────────────────────────────────
export const useAdminOrders = (params = {}) =>
  useQuery({
    queryKey: ["admin-orders", params],
    queryFn: () => api.get("/admin/orders", { params }).then((r) => r.data),
    keepPreviousData: true,
  });

export const useAdminOrderStats = () =>
  useQuery({
    queryKey: ["admin-order-stats"],
    queryFn: () => api.get("/admin/orders/stats").then((r) => r.data.data),
    staleTime: 30_000,
  });

export const useAdminOrder = (id) =>
  useQuery({
    queryKey: ["admin-order", id],
    queryFn: () => api.get(`/admin/orders/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });

export const useMarkRefunded = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }) => api.post(`/admin/orders/${id}/mark-refunded`, { reason }).then((r) => r.data),
    onSuccess: () => {
      toast.success("Order marked as refunded.");
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      qc.invalidateQueries({ queryKey: ["admin-order-stats"] });
      qc.invalidateQueries({ queryKey: ["admin-licenses"] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Refund failed."),
  });
};
