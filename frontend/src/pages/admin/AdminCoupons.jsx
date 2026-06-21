import { useState } from "react";
import { Tag, Plus, X, Loader2, Trash2, Percent, DollarSign } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Input, FormField, Alert } from "../../components/ui";
import Pagination from "../../components/ui/Pagination";
import { useAdminCoupons, useCreateCoupon, useDeactivateCoupon } from "../../hooks/useSupport";

const couponSchema = z.object({
  code:      z.string().min(2).max(50),
  type:      z.enum(["percentage", "fixed"]),
  value:     z.coerce.number().min(0),
  maxUses:   z.coerce.number().int().min(1).optional().or(z.literal("")),
  expiresAt: z.string().optional(),
});

function CreateCouponModal({ onClose }) {
  const { mutateAsync, isPending } = useCreateCoupon();
  const [serverError, setServerError] = useState("");
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: zodResolver(couponSchema),
    defaultValues: { type: "percentage" },
  });
  const type = watch("type");

  const onSubmit = async (values) => {
    setServerError("");
    try {
      const payload = { ...values };
      if (!payload.maxUses) delete payload.maxUses;
      if (!payload.expiresAt) delete payload.expiresAt;
      else payload.expiresAt = new Date(payload.expiresAt).toISOString();
      await mutateAsync(payload);
      onClose();
    } catch (err) {
      setServerError(err.response?.data?.message || "Error creating coupon.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">New Coupon</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <Alert type="error" message={serverError} />

          <FormField label="Coupon code" error={errors.code?.message} required>
            <Input {...register("code")} placeholder="e.g. LAUNCH20" className="uppercase" error={errors.code} />
          </FormField>

          <FormField label="Discount type" required>
            <div className="grid grid-cols-2 gap-3">
              <label className={`flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer ${type === "percentage" ? "border-brand-500 bg-brand-50" : "border-gray-200"}`}>
                <input type="radio" value="percentage" {...register("type")} className="hidden" />
                <Percent className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium">Percentage</span>
              </label>
              <label className={`flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer ${type === "fixed" ? "border-brand-500 bg-brand-50" : "border-gray-200"}`}>
                <input type="radio" value="fixed" {...register("type")} className="hidden" />
                <DollarSign className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium">Fixed amount</span>
              </label>
            </div>
          </FormField>

          <FormField label={type === "percentage" ? "Discount %" : "Discount amount"} error={errors.value?.message} required>
            <Input {...register("value")} type="number" step="0.01"
              placeholder={type === "percentage" ? "e.g. 20" : "e.g. 10"} error={errors.value} />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Max uses (optional)" error={errors.maxUses?.message}>
              <Input {...register("maxUses")} type="number" placeholder="Unlimited" />
            </FormField>
            <FormField label="Expires (optional)" error={errors.expiresAt?.message}>
              <Input {...register("expiresAt")} type="date" />
            </FormField>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={isPending} className="flex-1">Create coupon</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminCoupons() {
  const [showCreate, setShowCreate] = useState(false);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAdminCoupons({ page, limit: 20 });
  const deactivate = useDeactivateCoupon();

  const coupons = data?.data || [];
  const pagination = data?.pagination || {};

  return (
    <>
      {showCreate && <CreateCouponModal onClose={() => setShowCreate(false)} />}

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Coupons</h1>
            <p className="text-sm text-gray-500 mt-0.5">{pagination.total ?? "—"} total coupons</p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" /> New coupon
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-40"><Loader2 className="w-8 h-8 text-brand-500 animate-spin" /></div>
        ) : coupons.length === 0 ? (
          <div className="card p-12 text-center">
            <Tag className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No coupons yet</p>
            <p className="text-sm text-gray-400 mt-1">Create one to offer discounts at checkout.</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="divide-y divide-gray-50">
              {coupons.map((c) => {
                const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
                const maxedOut = c.maxUses && c.usedCount >= c.maxUses;
                return (
                  <div key={c._id} className="flex items-center justify-between px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-brand-50 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Tag className="w-4 h-4 text-brand-600" />
                      </div>
                      <div>
                        <p className="font-mono font-semibold text-gray-800">{c.code}</p>
                        <p className="text-xs text-gray-400">
                          {c.type === "percentage" ? `${c.value}% off` : `$${c.value} off`}
                          {" · "}{c.usedCount}{c.maxUses ? `/${c.maxUses}` : ""} used
                          {c.expiresAt && ` · expires ${new Date(c.expiresAt).toLocaleDateString()}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        !c.isActive ? "bg-gray-100 text-gray-500" :
                        expired || maxedOut ? "bg-yellow-100 text-yellow-700" :
                        "bg-green-100 text-green-700"
                      }`}>
                        {!c.isActive ? "Inactive" : expired ? "Expired" : maxedOut ? "Maxed out" : "Active"}
                      </span>
                      {c.isActive && (
                        <button onClick={() => deactivate.mutate(c._id)}
                          className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-5 pb-4">
              <Pagination {...pagination} onPage={setPage} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
