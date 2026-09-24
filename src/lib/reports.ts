import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { bucketKeys, ymdAR, type Bucket, type DateRange } from "@/lib/dates";
import type { PaymentMethod } from "@/lib/types";
import type { SeriesPoint } from "@/components/admin/charts";

export interface SalesFilters {
  category?: string | null;
  product?: string | null;
  method?: PaymentMethod | null;
}

export interface SalesTotals { orders: number; units: number; revenue: number; billed: number; avg_ticket: number }
export interface VisitTotals { views: number; visitors: number; logged_views: number; guest_views: number; orders: number; conversion: number }

export interface VisitFilters {
  path?: string | null;
  product?: string | null;
  audience?: "all" | "logged" | "guest";
  source?: string | null;
}

const num = (v: unknown) => Number(v ?? 0);

export function bucketLabel(key: string, bucket: Bucket): string {
  const [y, m, d] = key.split("-");
  if (bucket === "month") return `${m}/${y}`;
  return `${d}/${m}`;
}

export async function salesTotals(from: Date, to: Date, f: SalesFilters = {}): Promise<SalesTotals> {
  const { data } = await createAdminClient()
    .rpc("report_sales_totals", {
      p_from: from.toISOString(),
      p_to: to.toISOString(),
      p_category: f.category ?? null,
      p_product: f.product ?? null,
      p_method: f.method ?? null,
    })
    .single<SalesTotals>();
  return {
    orders: num(data?.orders),
    units: num(data?.units),
    revenue: num(data?.revenue),
    billed: num(data?.billed),
    avg_ticket: num(data?.avg_ticket),
  };
}

async function salesSeriesRaw(from: Date, to: Date, bucket: Bucket, f: SalesFilters) {
  const { data } = await createAdminClient().rpc("report_sales_series", {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_bucket: bucket,
    p_category: f.category ?? null,
    p_product: f.product ?? null,
    p_method: f.method ?? null,
  });
  return (data ?? []) as { bucket: string; orders: number; units: number; revenue: number }[];
}

/** Serie de ventas con ceros completados y comparación opcional con el período anterior. */
export async function salesSeries(
  range: DateRange,
  f: SalesFilters = {},
  metric: "revenue" | "orders" | "units" = "revenue",
  compare = false,
): Promise<SeriesPoint[]> {
  const keys = bucketKeys(range);
  const [cur, prev] = await Promise.all([
    salesSeriesRaw(range.from, range.to, range.bucket, f),
    compare ? salesSeriesRaw(range.prevFrom, range.prevTo, range.bucket, f) : Promise.resolve([]),
  ]);
  const curMap = new Map(cur.map((r) => [String(r.bucket).slice(0, 10), num(r[metric])]));
  // El período anterior se alinea por posición
  const prevKeys = compare
    ? bucketKeys({ fromYmd: ymdAR(range.prevFrom), toYmd: ymdAR(new Date(range.prevTo.getTime() - 1)), bucket: range.bucket })
    : [];
  const prevMap = new Map(prev.map((r) => [String(r.bucket).slice(0, 10), num(r[metric])]));
  return keys.map((k, i) => ({
    label: bucketLabel(k, range.bucket),
    value: curMap.get(k) ?? 0,
    ...(compare ? { previous: prevMap.get(prevKeys[i]) ?? 0 } : {}),
  }));
}

export async function visitTotals(from: Date, to: Date, f: VisitFilters = {}): Promise<VisitTotals> {
  const { data } = await createAdminClient()
    .rpc("report_visits_totals", {
      p_from: from.toISOString(),
      p_to: to.toISOString(),
      p_path: f.path ?? null,
      p_product: f.product ?? null,
      p_audience: f.audience ?? "all",
      p_source: f.source ?? null,
    })
    .single<VisitTotals>();
  return {
    views: num(data?.views),
    visitors: num(data?.visitors),
    logged_views: num(data?.logged_views),
    guest_views: num(data?.guest_views),
    orders: num(data?.orders),
    conversion: num(data?.conversion),
  };
}

export async function visitSeries(range: DateRange, f: VisitFilters = {}, metric: "views" | "visitors" = "views"): Promise<SeriesPoint[]> {
  const { data } = await createAdminClient().rpc("report_visits_series", {
    p_from: range.from.toISOString(),
    p_to: range.to.toISOString(),
    p_bucket: range.bucket,
    p_path: f.path ?? null,
    p_product: f.product ?? null,
    p_audience: f.audience ?? "all",
    p_source: f.source ?? null,
  });
  const map = new Map(((data ?? []) as { bucket: string; views: number; visitors: number }[]).map((r) => [String(r.bucket).slice(0, 10), num(r[metric])]));
  return bucketKeys(range).map((k) => ({ label: bucketLabel(k, range.bucket), value: map.get(k) ?? 0 }));
}
