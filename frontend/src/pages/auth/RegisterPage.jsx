import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, CheckCircle } from "lucide-react";
import AuthLayout from "../../components/AuthLayout";
import { Input, FormField, Button, Alert } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Enter a valid email"),
  companyName: z.string().optional(),
  password: z
    .string()
    .min(8, "At least 8 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[0-9]/, "Must contain a number"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export default function RegisterPage() {
  const { register: registerUser } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");
  const [success, setSuccess] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values) => {
    setServerError("");
    try {
      const payload = { ...values };
      delete payload.confirmPassword;
      await registerUser(payload);
      setSuccess(true);
    } catch (err) {
      setServerError(err.response?.data?.message || "Registration failed. Please try again.");
    }
  };

  if (success) {
    return (
      <AuthLayout title="Check your email" subtitle="One more step to get started">
        <div className="text-center space-y-4">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
          <p className="text-gray-600 text-sm">
            We've sent a verification link to your email address. Please click the link to activate your account.
          </p>
          <Link to="/login" className="btn-primary inline-flex">
            Back to Sign In
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Create your account" subtitle="Start managing your plugin licenses">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Alert type="error" message={serverError} />

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Full name" error={errors.name?.message} required>
            <Input {...register("name")} placeholder="John Doe" error={errors.name} autoComplete="name" />
          </FormField>
          <FormField label="Company (optional)" error={errors.companyName?.message}>
            <Input {...register("companyName")} placeholder="Acme Inc." autoComplete="organization" />
          </FormField>
        </div>

        <FormField label="Email address" error={errors.email?.message} required>
          <Input {...register("email")} type="email" placeholder="you@example.com" error={errors.email} autoComplete="email" />
        </FormField>

        <FormField label="Password" error={errors.password?.message} required>
          <div className="relative">
            <Input
              {...register("password")}
              type={showPassword ? "text" : "password"}
              placeholder="Min. 8 chars, 1 uppercase, 1 number"
              error={errors.password}
              autoComplete="new-password"
              className="pr-10"
            />
            <button type="button" onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </FormField>

        <FormField label="Confirm password" error={errors.confirmPassword?.message} required>
          <Input
            {...register("confirmPassword")}
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            error={errors.confirmPassword}
            autoComplete="new-password"
          />
        </FormField>

        <Button type="submit" loading={isSubmitting} className="w-full">
          Create account
        </Button>

        <p className="text-center text-sm text-gray-500">
          Already have an account?{" "}
          <Link to="/login" className="text-brand-600 hover:text-brand-700 font-medium">Sign in</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
