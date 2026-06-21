import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Shows a spinner while auth state is loading
function AuthLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// Redirect to login if not authenticated; optionally enforce roles
export function ProtectedRoute({ roles }) {
  const { user, loading } = useAuth();
  if (loading) return <AuthLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

// Redirect to dashboard if already logged in (for login/register pages)
export function PublicRoute() {
  const { user, loading } = useAuth();
  if (loading) return <AuthLoader />;
  if (user) return <Navigate to={user.role === "admin" ? "/admin" : "/dashboard"} replace />;
  return <Outlet />;
}
