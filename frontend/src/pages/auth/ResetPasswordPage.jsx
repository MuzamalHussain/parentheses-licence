import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { XCircle } from "lucide-react";
import toast from "react-hot-toast";
import AuthLayout from "../../components/AuthLayout";
import { Input, FormField, Button, Alert } from "../../components/ui";
import api from "../../lib/api";

const schema = z
  .object({
    password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState("");
  const token = searchParams.get("token");

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
  });

  if (!token) {
    return (
      <AuthLayout title="Invalid link">
        <div className="text-center space-y-4">
          <XCircle className="w-16 h-16 text-red-400 mx-auto" />
          <p className="text-gray-600 text-sm">This reset link is missing or invalid.</p>
          <Link to="/forgot-password" className="btn-primary inline-flex">Request a new link</Link>
        </div>
      </AuthLayout>
    );
  }

  const onSubmit = async ({ password }) => {
    setServerError("");
    try {
      await api.post("/auth/reset-password", { token, password });
      toast.success("Password reset! Please sign in.");
      navigate("/login");
    } catch (err) {
      setServerError(err.response?.data?.message || "Reset failed. The link may have expired.");
    }
  };

  return (
    <AuthLayout title="Choose a new password">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Alert type="error" message={serverError} />

        <FormField label="New password" error={errors.password?.message} required>
          <Input {...register("password")} type="password" placeholder="Min. 8 chars, 1 uppercase, 1 number" error={errors.password} />
        </FormField>

        <FormField label="Confirm new password" error={errors.confirmPassword?.message} required>
          <Input {...register("confirmPassword")} type="password" placeholder="••••••••" error={errors.confirmPassword} />
        </FormField>

        <Button type="submit" loading={isSubmitting} className="w-full">Reset password</Button>
      </form>
    </AuthLayout>
  );
}
