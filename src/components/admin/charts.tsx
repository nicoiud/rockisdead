"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, formatNumber } from "@/lib/format";

// Paleta validada (dataviz): serie actual = azul slot 1; período anterior = gris neutro punteado.
const CURRENT = "#2a78d6";
const PREVIOUS = "#8f8e8a";
const GRID = "#e7e6e2";
const AXIS = "#52514e";

export interface SeriesPoint {
  label: string; // fecha legible
  value: number;
  previous?: number;
}

type Fmt = "money" | "number";
const fmt = (f: Fmt) => (v: number) => (f === "money" ? formatMoney(v) : formatNumber(v));
const compact = (f: Fmt) => (v: number) => {
  const abs = Math.abs(v);
  const s = abs >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : abs >= 1000 ? `${Math.round(v / 1000)}k` : String(v);
  return f === "money" ? `$${s}` : s;
};

export function TimeSeriesChart({
  data,
  format = "number",
  seriesLabel,
  previousLabel,
  height = 260,
}: {
  data: SeriesPoint[];
  format?: Fmt;
  seriesLabel: string;
  previousLabel?: string;
  height?: number;
}) {
  const hasPrevious = !!previousLabel && data.some((d) => d.previous !== undefined);
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={16} />
          <YAxis tickFormatter={compact(format)} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} width={56} />
          <Tooltip
            formatter={(v, name) => [fmt(format)(Number(v)), name]}
            contentStyle={{ fontSize: 12, borderColor: GRID }}
            cursor={{ stroke: AXIS, strokeDasharray: "3 3" }}
          />
          {hasPrevious && <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />}
          {hasPrevious && (
            <Line type="monotone" dataKey="previous" name={previousLabel} stroke={PREVIOUS} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4 }} />
          )}
          <Line type="monotone" dataKey="value" name={seriesLabel} stroke={CURRENT} strokeWidth={2} dot={data.length <= 31 ? { r: 3 } : false} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Ranking con barras horizontales (HTML accesible, el valor siempre visible). */
export function BarList({ data, format = "number", secondary }: { data: { label: string; value: number; sub?: string }[]; format?: Fmt; secondary?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <p className="text-sm text-neutral-500">Sin datos en el período.</p>;
  return (
    <ul className="space-y-2">
      {data.map((d, i) => (
        <li key={i} className="text-sm">
          <div className="flex justify-between gap-3">
            <span className="truncate">{d.label}</span>
            <span className="shrink-0 font-semibold tabular-nums">
              {fmt(format)(d.value)}
              {d.sub && <span className="ml-2 font-normal text-neutral-500">{d.sub}</span>}
            </span>
          </div>
          <div className="mt-1 h-2 bg-neutral-100" title={secondary}>
            <div className="h-2 rounded-r" style={{ width: `${(d.value / max) * 100}%`, background: CURRENT }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
