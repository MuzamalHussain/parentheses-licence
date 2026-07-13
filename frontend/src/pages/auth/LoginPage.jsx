import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff } from "lucide-react";
import toast from "react-hot-toast";
import AuthLayout from "../../components/AuthLayout";
import { Input, FormField, Button, Alert } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import api from "../../lib/api";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");
  const [unverifiedEmail, setUnverifiedEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const from = location.state?.from?.pathname;

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values) => {
    setServerError("");
    setUnverifiedEmail("");
    try {
      const user = await login(values.email, values.password);
      toast.success(`Welcome back, ${user.name.split(" ")[0]}!`);
      const dest = from || (user.role === "admin" ? "/admin" : "/dashboard");
      navigate(dest, { replace: true });
    } catch (err) {
      setServerError(err.response?.data?.message || "Login failed. Please try again.");
      if (err.response?.data?.code === "EMAIL_NOT_VERIFIED") setUnverifiedEmail(values.email);
    }
  };

  const resend = async () => {
    setResending(true);
    setResendMessage("");
    try {
      const response = await api.post("/auth/resend-verification", { email: unverifiedEmail });
      const seconds = response.data?.data?.cooldownSeconds || 60;
      setResendMessage(response.data?.message || "Verification email sent.");
      setCooldown(seconds);
    } catch (err) {
      setResendMessage(err.response?.data?.message || "Could not resend the verification email.");
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout title="Sign in to your account" subtitle="Manage your plugin licenses">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Alert type="error" message={serverError} />
        {unverifiedEmail && (
          <div className="space-y-2">
            <Button type="button" variant="secondary" loading={resending} disabled={cooldown > 0} onClick={resend} className="w-full">
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend Verification Email"}
            </Button>
            {resendMessage && <p className="text-center text-sm text-gray-600">{resendMessage}</p>}
          </div>
        )}

        <FormField label="Email address" error={errors.email?.message} required>
          <Input
            {...register("email")}
            type="email"
            placeholder="you@example.com"
            error={errors.email}
            autoComplete="email"
          />
        </FormField>

        <FormField label="Password" error={errors.password?.message} required>
          <div className="relative">
            <Input
              {...register("password")}
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              error={errors.password}
              autoComplete="current-password"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </FormField>

        <div className="flex items-center justify-end">
          <Link to="/forgot-password" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" loading={isSubmitting} className="w-full">
          Sign in
        </Button>

        <p className="text-center text-sm text-gray-500">
          Don't have an account?{" "}
          <Link to="/register" className="text-brand-600 hover:text-brand-700 font-medium">
            Sign up
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
