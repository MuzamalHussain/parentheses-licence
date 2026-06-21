const STATUS_STYLES = {
  active:    "bg-green-100 text-green-700",
  suspended: "bg-yellow-100 text-yellow-700",
  revoked:   "bg-red-100 text-red-700",
  expired:   "bg-gray-200 text-gray-500",
  archived:  "bg-gray-200 text-gray-500",
  paid:      "bg-green-100 text-green-700",
  pending:   "bg-yellow-100 text-yellow-700",
  failed:    "bg-red-100 text-red-700",
  inactive:  "bg-gray-200 text-gray-500",
};

export default function StatusBadge({ status, className = "" }) {
  const style = STATUS_STYLES[status] || "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full capitalize ${style} ${className}`}>
      {status}
    </span>
  );
}
