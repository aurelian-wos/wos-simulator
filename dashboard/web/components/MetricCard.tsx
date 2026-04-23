interface MetricCardProps {
  label: string;
  value: string;
  color?: string;
  valueClassName?: string;
}

export default function MetricCard({
  label,
  value,
  color,
  valueClassName = "text-lg sm:text-xl",
}: MetricCardProps) {
  return (
    <div
      className="flex min-w-[8.5rem] flex-1 flex-col gap-1 rounded p-4 sm:min-w-28 sm:flex-none"
      style={{
        border: "1px solid var(--border-color)",
        backgroundColor: "var(--sidebar-bg)",
      }}
    >
      <span className="text-[11px] uppercase tracking-wider opacity-50">
        {label}
      </span>
      <span
        className={`break-words font-mono font-bold leading-tight ${valueClassName}`}
        style={{ color: color ?? "var(--sidebar-active)" }}
      >
        {value}
      </span>
    </div>
  );
}
