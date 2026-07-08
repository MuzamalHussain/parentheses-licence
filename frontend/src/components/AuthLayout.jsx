import { Link } from "react-router-dom";
import { usePublicBrand } from "../hooks/useAccount";

export default function AuthLayout({ title, subtitle, children }) {
  const { data: brand } = usePublicBrand();
  const name = brand?.identity?.displayName || "Parentheses";
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-gray-100 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-lg">P</span>
            </div>
            <span className="text-xl font-bold text-gray-900">{name}</span>
          </Link>
        </div>

        {/* Card */}
        <div className="card p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            {subtitle && <p className="text-sm text-gray-500 mt-1">{brand?.login?.welcomeText || subtitle}</p>}
          </div>
          {children}
          {brand?.login?.footerText && <p className="text-xs text-gray-400 mt-6">{brand.login.footerText}</p>}
        </div>
      </div>
    </div>
  );
}
