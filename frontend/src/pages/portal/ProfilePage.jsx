import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertCircle, Building2, CheckCircle2, Loader2, Lock, Mail, ShieldCheck, User } from "lucide-react";
import { Alert, Button, FormField, Input } from "../../components/ui";
import { useChangePassword, useProfile, useUpdateProfile } from "../../hooks/useAccount";

const profileSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100, "Name is too long"),
  companyName: z.string().trim().max(150, "Company name is too long").optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z
    .string()
    .min(8, "At least 8 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[0-9]/, "Must contain a number"),
  confirmPassword: z.string().min(1, "Confirm your new password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  path: ["confirmPassword"],
  message: "Passwords do not match",
});

function statusText(value) {
  return value ? "Verified" : "Not verified";
}

function DetailItem({ icon: Icon, label, value, tone = "gray" }) {
  const tones = {
    gray: "text-gray-500 bg-gray-50",
    green: "text-green-600 bg-green-50",
    yellow: "text-yellow-600 bg-yellow-50",
    red: "text-red-600 bg-red-50",
    brand: "text-brand-600 bg-brand-50",
  };

  return (
    <div className="flex items-start gap-3 rounded-lg border border-gray-100 bg-white px-3 py-3">
      <div className={`p-1.5 rounded-lg ${tones[tone]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-medium text-gray-800 truncate">{value || "Not set"}</p>
      </div>
    </div>
  );
}

function AccountInformation({ profile }) {
  return (
    <div className="card p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-gray-900">Account Information</h2>
        <p className="text-sm text-gray-500 mt-0.5">Your account identity and access status.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <DetailItem icon={User} label="Name" value={profile?.name} tone="brand" />
        <DetailItem icon={Mail} label="Email" value={profile?.email} />
        <DetailItem icon={Building2} label="Company" value={profile?.companyName} />
        <DetailItem icon={ShieldCheck} label="Role" value={profile?.role} />
        <DetailItem
          icon={profile?.emailVerified ? CheckCircle2 : AlertCircle}
          label="Email Status"
          value={statusText(profile?.emailVerified)}
          tone={profile?.emailVerified ? "green" : "yellow"}
        />
        <DetailItem
          icon={profile?.isActive ? CheckCircle2 : AlertCircle}
          label="Account Status"
          value={profile?.isActive ? "Active" : "Inactive"}
          tone={profile?.isActive ? "green" : "red"}
        />
      </div>
    </div>
  );
}

function ProfileForm({ profile }) {
  const updateProfile = useUpdateProfile();
  const [serverError, setServerError] = useState("");
  const [success, setSuccess] = useState("");

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: "", companyName: "" },
  });

  useEffect(() => {
    if (profile) {
      reset({
        name: profile.name || "",
        companyName: profile.companyName || "",
      });
    }
  }, [profile, reset]);

  const onSubmit = async (values) => {
    setServerError("");
    setSuccess("");
    try {
      const nextProfile = await updateProfile.mutateAsync(values);
      reset({
        name: nextProfile.name || "",
        companyName: nextProfile.companyName || "",
      });
      setSuccess("Profile updated.");
    } catch (err) {
      setServerError(err.response?.data?.message || "Could not update profile. Please try again.");
    }
  };

  return (
    <div className="card p-5">
      <div className="mb-4">
        <h2 className="font-semibold text-gray-900">Update Profile</h2>
        <p className="text-sm text-gray-500 mt-0.5">Email changes are not available in this phase.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Alert type="error" message={serverError} />
        <Alert type="success" message={success} />

        <FormField label="Name" error={errors.name?.message} required>
          <Input {...register("name")} placeholder="Your full name" error={errors.name} autoComplete="name" />
        </FormField>

        <FormField label="Company" error={errors.companyName?.message}>
          <Input {...register("companyName")} placeholder="Company name" error={errors.companyName} autoComplete="organization" />
        </FormField>

        <Button type="submit" loading={updateProfile.isPending} disabled={!isDirty}>
          Save profile
        </Button>
      </form>
    </div>
  );
}

function PasswordForm() {
  const changePassword = useChangePassword();
  const [serverError, setServerError] = useState("");
  const [success, setSuccess] = useState("");

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const onSubmit = async (values) => {
    setServerError("");
    setSuccess("");
    try {
      await changePassword.mutateAsync(values);
      reset();
      setSuccess("Password changed successfully.");
    } catch (err) {
      setServerError(err.response?.data?.message || "Could not change password. Please try again.");
    }
  };

  return (
    <div className="card p-5">
      <div className="mb-4">
        <h2 className="font-semibold text-gray-900">Change Password</h2>
        <p className="text-sm text-gray-500 mt-0.5">Use a strong password you do not use elsewhere.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Alert type="error" message={serverError} />
        <Alert type="success" message={success} />

        <FormField label="Current password" error={errors.currentPassword?.message} required>
          <Input
            {...register("currentPassword")}
            type="password"
            error={errors.currentPassword}
            autoComplete="current-password"
          />
        </FormField>

        <FormField label="New password" error={errors.newPassword?.message} required>
          <Input
            {...register("newPassword")}
            type="password"
            placeholder="Min. 8 chars, 1 uppercase, 1 number"
            error={errors.newPassword}
            autoComplete="new-password"
          />
        </FormField>

        <FormField label="Confirm password" error={errors.confirmPassword?.message} required>
          <Input
            {...register("confirmPassword")}
            type="password"
            error={errors.confirmPassword}
            autoComplete="new-password"
          />
        </FormField>

        <Button type="submit" loading={changePassword.isPending}>
          Change password
        </Button>
      </form>
    </div>
  );
}

function SecurityInfo({ profile }) {
  return (
    <div className="card p-5">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-brand-50 text-brand-600">
          <Lock className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-semibold text-gray-900">Security Info</h2>
          <div className="mt-3 space-y-2 text-sm text-gray-500">
            <p>Email verification: <span className="font-medium text-gray-700">{statusText(profile?.emailVerified)}</span></p>
            <p>Account status: <span className="font-medium text-gray-700">{profile?.isActive ? "Active" : "Inactive"}</span></p>
            <p>Last login: <span className="font-medium text-gray-700">{profile?.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleString() : "Not available"}</span></p>
            <p>Active sessions: <span className="font-medium text-gray-700">Managed securely by refresh sessions.</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { data: profile, isLoading, error } = useProfile();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return <Alert type="error" message={error.response?.data?.message || "Could not load your profile."} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your account details and password.</p>
      </div>

      <AccountInformation profile={profile} />

      <div className="grid lg:grid-cols-2 gap-6">
        <ProfileForm profile={profile} />
        <PasswordForm />
      </div>

      <SecurityInfo profile={profile} />
    </div>
  );
}
