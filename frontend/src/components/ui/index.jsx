import { forwardRef } from "react";
import { Loader2 } from "lucide-react";

export const Input = forwardRef(({ error, className = "", ...props }, ref) => (
  <input
    ref={ref}
    className={`input ${error ? "input-error" : ""} ${className}`}
    {...props}
  />
));
Input.displayName = "Input";

export function FormField({ label, error, children, required }) {
  return (
    <div>
      {label && (
        <label className="label">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      {children}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

export function Button({ children, loading, className = "", variant = "primary", ...props }) {
  const cls = variant === "secondary" ? "btn-secondary" : "btn-primary";
  return (
    <button className={`${cls} ${className}`} disabled={loading || props.disabled} {...props}>
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Alert({ type = "error", message }) {
  if (!message) return null;
  const styles = {
    error: "bg-red-50 border border-red-200 text-red-700",
    success: "bg-green-50 border border-green-200 text-green-700",
    info: "bg-blue-50 border border-blue-200 text-blue-700",
  };
  return (
    <div className={`rounded-lg px-4 py-3 text-sm ${styles[type]}`}>
      {message}
    </div>
  );
}
