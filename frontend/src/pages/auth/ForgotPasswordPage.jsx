import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail } from "lucide-react";
import AuthLayout from "../../components/AuthLayout";
import { Input, FormField, Button, Alert } from "../../components/ui";
import api from "../../lib/api";

const schema = z.object({ email: z.string().email("Enter a valid email") });

export default function ForgotPasswordPage() {
  const [serverMsg, setServerMsg] = useState({ type: "", text: "" });
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
  });

  const onSubmit = async ({ email }) => {
    setServerMsg({ type: "", text: "" });
    try {
      const { data } = await api.post("/auth/forgot-password", { email });
      setServerMsg({ type: "success", text: data.message });
    } catch (err) {
      setServerMsg({ type: "error", text: err.response?.data?.message || "Something went wrong." });
    }
  };

  return (
    <AuthLayout title="Reset your password" subtitle="We'll send a reset link to your email">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Alert type={serverMsg.type || "info"} message={serverMsg.text} />

        <FormField label="Email address" error={errors.email?.message} required>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input {...register("email")} type="email" placeholder="you@example.com" error={errors.email} className="pl-9" />
          </div>
        </FormField>

        <Button type="submit" loading={isSubmitting} className="w-full">
          Send reset link
        </Button>

        <p className="text-center text-sm text-gray-500">
          Remembered it?{" "}
          <Link to="/login" className="text-brand-600 hover:text-brand-700 font-medium">Sign in</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
