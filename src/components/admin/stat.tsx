import { cx } from "@/components/ui";

export function Stat({ label, value, change, hint }: { label: string; value: string; change?: number | null; hint?: string }) {
  return (
    <div className="border border-neutral-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums">{value}</p>
      {change !== undefined && (
        <p className={cx("mt-1 text-xs", change === null ? "text-neutral-500" : change >= 0 ? "text-green-700" : "text-red-700")}>
          {change === null ? "Sin datos previos" : `${change >= 0 ? "▲" : "▼"} ${Math.abs(change).toFixed(1)}% vs período anterior`}
        </p>
      )}
      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}
