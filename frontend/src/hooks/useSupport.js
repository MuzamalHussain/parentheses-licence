import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import toast from "react-hot-toast";

// ── Admin: Coupons ────────────────────────────────────────────────────────────
export const useAdminCoupons = (params = {}) =>
  useQuery({
    queryKey: ["admin-coupons", params],
    queryFn: () => api.get("/admin/coupons", { params }).then((r) => r.data),
    keepPreviousData: true,
  });

export const useCreateCoupon = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post("/admin/coupons", data).then((r) => r.data),
    onSuccess: () => {
      toast.success("Coupon created.");
      qc.invalidateQueries({ queryKey: ["admin-coupons"] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Error creating coupon."),
  });
};

export const useUpdateCoupon = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/admin/coupons/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      toast.success("Coupon updated.");
      qc.invalidateQueries({ queryKey: ["admin-coupons"] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Error updating coupon."),
  });
};

export const useDeactivateCoupon = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/admin/coupons/${id}`).then((r) => r.data),
    onSuccess: () => {
      toast.success("Coupon deactivated.");
      qc.invalidateQueries({ queryKey: ["admin-coupons"] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Error."),
  });
};

// ── Customer: Support ─────────────────────────────────────────────────────────
export const useMyTickets = (params = {}) =>
  useQuery({
    queryKey: ["my-tickets", params],
    queryFn: () => api.get("/support/tickets", { params }).then((r) => r.data),
    keepPreviousData: true,
  });

export const useMyTicket = (id) =>
  useQuery({
    queryKey: ["my-ticket", id],
    queryFn: () => api.get(`/support/tickets/${id}`).then((r) => r.data.data),
    enabled: !!id,
    refetchInterval: 15_000, // light polling so replies show up without a manual refresh
  });

export const useCreateTicket = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post("/support/tickets", data).then((r) => r.data),
    onSuccess: () => {
      toast.success("Ticket submitted.");
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Error creating ticket."),
  });
};

export const useReplyToTicket = (id) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (message) => api.post(`/support/tickets/${id}/reply`, { message }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-ticket", id] });
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Error sending reply."),
  });
};

// ── Admin: Support ─────────────────────────────────────────────────────────────
export const useAdminTickets = (params = {}) =>
  useQuery({
    queryKey: ["admin-tickets", params],
    queryFn: () => api.get("/admin/support/tickets", { params }).then((r) => r.data),
    keepPreviousData: true,
  });

export const useAdminTicketStats = () =>
  useQuery({
    queryKey: ["admin-ticket-stats"],
    queryFn: () => api.get("/admin/support/tickets/stats").then((r) => r.data.data),
    staleTime: 30_000,
  });

export const useAdminTicket = (id) =>
  useQuery({
    queryKey: ["admin-ticket", id],
    queryFn: () => api.get(`/admin/support/tickets/${id}`).then((r) => r.data.data),
    enabled: !!id,
    refetchInterval: 15_000,
  });

export const useAdminReplyToTicket = (id) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (message) => api.post(`/admin/support/tickets/${id}/reply`, { message }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-ticket", id] });
      qc.invalidateQueries({ queryKey: ["admin-tickets"] });
      qc.invalidateQueries({ queryKey: ["admin-ticket-stats"] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Error sending reply."),
  });
};

export const useUpdateTicketStatus = (id) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status) => api.patch(`/admin/support/tickets/${id}/status`, { status }).then((r) => r.data),
    onSuccess: () => {
      toast.success("Status updated.");
      qc.invalidateQueries({ queryKey: ["admin-ticket", id] });
      qc.invalidateQueries({ queryKey: ["admin-tickets"] });
      qc.invalidateQueries({ queryKey: ["admin-ticket-stats"] });
    },
    onError: (err) => toast.error(err.response?.data?.message || "Error updating status."),
  });
};
