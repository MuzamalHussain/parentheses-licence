import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, Package, Key, Users, Globe, Download, ShoppingCart, Ticket, FileText, LogOut, Menu, ShieldCheck, Tag, Settings, Workflow, Activity, Plug, Braces, Webhook, Rocket, BookOpen, KeyRound, Fingerprint, FileCheck2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";

const navItems = [
  { to: "/admin", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/admin/products", icon: Package, label: "Products & Plans" },
  { to: "/admin/licenses", icon: Key, label: "Licenses" },
  { to: "/admin/users", icon: Users, label: "Customers", roles: ["admin"] },
  { to: "/admin/domains", icon: Globe, label: "Domains" },
  { to: "/admin/downloads", icon: Download, label: "Plugin Versions" },
  { to: "/admin/orders", icon: ShoppingCart, label: "Orders" },
  { to: "/admin/coupons", icon: Tag, label: "Coupons" },
  { to: "/admin/support", icon: Ticket, label: "Support" },
  { to: "/admin/audit", icon: FileText, label: "Audit Log" },
  { to: "/admin/workflows", icon: Workflow, label: "Automation", roles: ["admin"] },
  { to: "/admin/operations", icon: Activity, label: "Operations", roles: ["admin"] },
  { to: "/admin/integrations", icon: Plug, label: "Integrations", roles: ["admin"] },
  { to: "/admin/api-keys", icon: Braces, label: "API Keys", roles: ["admin"] },
  { to: "/admin/webhooks", icon: Webhook, label: "Webhooks", roles: ["admin"] },
  { to: "/admin/release-automation", icon: Rocket, label: "Releases", roles: ["admin"] },
  { to: "/admin/developer-portal", icon: BookOpen, label: "Developer Portal", roles: ["admin"] },
  { to: "/admin/rbac", icon: KeyRound, label: "Teams & RBAC", roles: ["admin"] },
  { to: "/admin/identity", icon: Fingerprint, label: "Identity", roles: ["admin"] },
  { to: "/admin/compliance", icon: FileCheck2, label: "Compliance", roles: ["admin"] },
  { to: "/admin/settings", icon: Settings, label: "Settings", roles: ["admin"] },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    toast.success("Logged out.");
    navigate("/login");
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-brand-400" />
          <span className="font-bold text-white text-sm">Admin Panel</span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">Parentheses Solutions</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.filter((item) => !item.roles || item.roles.includes(user?.role)).map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-brand-600 text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white"
              }`
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-gray-800">
        <div className="px-3 py-2 mb-1">
          <p className="text-sm text-white font-medium truncate">{user?.name}</p>
          <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm font-medium text-gray-400 hover:bg-red-900/40 hover:text-red-400 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 flex-col bg-gray-900 flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-56 bg-gray-900 z-50 shadow-2xl">
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-gray-100">
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-semibold text-gray-900 text-sm">Admin Panel</span>
        </div>

        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
