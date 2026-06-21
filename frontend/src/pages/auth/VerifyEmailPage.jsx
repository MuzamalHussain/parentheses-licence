import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import AuthLayout from "../../components/AuthLayout";
import api from "../../lib/api";

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("loading"); // loading | success | error
  const [message, setMessage] = useState("");
  const token = searchParams.get("token");

  useEffect(() => {
    if (!token) { setStatus("error"); setMessage("No verification token found in the link."); return; }
    api.get(`/auth/verify-email?token=${token}`)
      .then(({ data }) => { setStatus("success"); setMessage(data.message); })
      .catch((err) => { setStatus("error"); setMessage(err.response?.data?.message || "Verification failed."); });
  }, [token]);

  return (
    <AuthLayout title="Email Verification">
      <div className="text-center space-y-4 py-4">
        {status === "loading" && <Loader2 className="w-16 h-16 text-brand-500 mx-auto animate-spin" />}
        {status === "success" && <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />}
        {status === "error" && <XCircle className="w-16 h-16 text-red-400 mx-auto" />}
        <p className="text-gray-600 text-sm">{message || "Verifying your email..."}</p>
        {status !== "loading" && (
          <Link to="/login" className="btn-primary inline-flex">
            {status === "success" ? "Sign in now" : "Back to sign in"}
          </Link>
        )}
      </div>
    </AuthLayout>
  );
}
