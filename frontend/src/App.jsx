import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute, PublicRoute } from "./components/ProtectedRoute";

import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";
import VerifyEmailPage from "./pages/auth/VerifyEmailPage";

import PortalLayout from "./components/PortalLayout";
import AdminLayout from "./components/AdminLayout";

import DashboardHome from "./pages/portal/DashboardHome";
import BrowsePlansPage from "./pages/portal/BrowsePlansPage";
import LicensesPage from "./pages/portal/LicensesPage";
import DownloadsPage from "./pages/portal/DownloadsPage";
import OrdersPage from "./pages/portal/OrdersPage";
import SupportPage from "./pages/portal/SupportPage";
import ProfilePage from "./pages/portal/ProfilePage";

import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminProductsPage from "./pages/admin/AdminProductsPage";
import AdminLicenses from "./pages/admin/AdminLicenses";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminUserDetailPage from "./pages/admin/AdminUserDetailPage";
import AdminOrders from "./pages/admin/AdminOrders";
import AdminCoupons from "./pages/admin/AdminCoupons";
import AdminDomains from "./pages/admin/AdminDomains";
import AdminDownloads from "./pages/admin/AdminDownloads";
import AdminSupport from "./pages/admin/AdminSupport";
import AdminAudit from "./pages/admin/AdminAudit";
import AdminWorkflows from "./pages/admin/AdminWorkflows";
import AdminOperations from "./pages/admin/AdminOperations";
import AdminIntegrations from "./pages/admin/AdminIntegrations";
import AdminApiKeys from "./pages/admin/AdminApiKeys";
import AdminWebhooks from "./pages/admin/AdminWebhooks";
import AdminReleaseAutomation from "./pages/admin/AdminReleaseAutomation";
import AdminDeveloperPortal from "./pages/admin/AdminDeveloperPortal";
import AdminSettings from "./pages/admin/AdminSettings";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
          <Routes>
            <Route element={<PublicRoute />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
            </Route>

            <Route path="/verify-email" element={<VerifyEmailPage />} />

            <Route element={<ProtectedRoute roles={["customer", "admin", "support"]} />}>
              <Route element={<PortalLayout />}>
                <Route path="/dashboard" element={<DashboardHome />} />
                <Route path="/dashboard/plans" element={<BrowsePlansPage />} />
                <Route path="/dashboard/licenses" element={<LicensesPage />} />
                <Route path="/dashboard/downloads" element={<DownloadsPage />} />
                <Route path="/dashboard/orders" element={<OrdersPage />} />
                <Route path="/dashboard/support" element={<SupportPage />} />
                <Route path="/dashboard/profile" element={<ProfilePage />} />
              </Route>
            </Route>

            <Route element={<ProtectedRoute roles={["admin"]} />}>
              <Route element={<AdminLayout />}>
                <Route path="/admin/users" element={<AdminUsers />} />
                <Route path="/admin/users/:id" element={<AdminUserDetailPage />} />
                <Route path="/admin/workflows" element={<AdminWorkflows />} />
                <Route path="/admin/operations" element={<AdminOperations />} />
                <Route path="/admin/integrations" element={<AdminIntegrations />} />
                <Route path="/admin/api-keys" element={<AdminApiKeys />} />
                <Route path="/admin/webhooks" element={<AdminWebhooks />} />
                <Route path="/admin/release-automation" element={<AdminReleaseAutomation />} />
                <Route path="/admin/developer-portal" element={<AdminDeveloperPortal />} />
              </Route>
            </Route>

            <Route element={<ProtectedRoute roles={["admin", "support"]} />}>
              <Route element={<AdminLayout />}>
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/products" element={<AdminProductsPage />} />
                <Route path="/admin/licenses" element={<AdminLicenses />} />
                <Route path="/admin/orders" element={<AdminOrders />} />
                <Route path="/admin/coupons" element={<AdminCoupons />} />
                <Route path="/admin/domains" element={<AdminDomains />} />
                <Route path="/admin/downloads" element={<AdminDownloads />} />
                <Route path="/admin/support" element={<AdminSupport />} />
                <Route path="/admin/audit" element={<AdminAudit />} />
                <Route path="/admin/settings" element={<AdminSettings />} />
              </Route>
            </Route>

            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
