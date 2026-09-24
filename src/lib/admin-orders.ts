import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { startOfDayAR } from "@/lib/dates";
import { ORDER_STATUSES } from "@/lib/labels";
import type { Order, OrderStatus, PaymentMethod } from "@/lib/types";

export interface OrderFilters {
  status?: OrderStatus | "review";
  method?: PaymentMethod;
  from?: string; // YYYY-MM-DD
  to?: string;
  q?: string;
  min?: number;
  max?: number;
}

export function orderFiltersFromParams(sp: Record<string, string | string[] | undefined>): OrderFilters {
  const s = (k: string) => (typeof sp[k] === "string" && sp[k] !== "" ? (sp[k] as string) : undefined);
  const n = (k: string) => (s(k) !== undefined && Number.isFinite(Number(s(k))) ? Number(s(k)) : undefined);
  const ymd = (k: string) => (s(k) && /^\d{4}-\d{2}-\d{2}$/.test(s(k)!) ? s(k) : undefined);
  const status = s("estado");
  const method = s("metodo");
  return {
    status: status === "review" || (status && ORDER_STATUSES.includes(status as OrderStatus)) ? (status as OrderFilters["status"]) : undefined,
    method: method === "mercado_pago" || method === "transfer" ? method : undefined,
    from: ymd("desde"),
    to: ymd("hasta"),
    q: s("q"),
    min: n("min"),
    max: n("max"),
  };
}

export function orderFiltersToParams(f: OrderFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.status) p.set("estado", f.status);
  if (f.method) p.set("metodo", f.method);
  if (f.from) p.set("desde", f.from);
  if (f.to) p.set("hasta", f.to);
  if (f.q) p.set("q", f.q);
  if (f.min !== undefined) p.set("min", String(f.min));
  if (f.max !== undefined) p.set("max", String(f.max));
  return p;
}

export type OrderListRow = Order & { payments: { status: string; receipt_path: string | null }[] };

export async function listOrders(f: OrderFilters, page = 1, perPage = 50, select = "*, payments(status, receipt_path)") {
  const db = createAdminClient();
  let q = db.from("orders").select(select, { count: "exact" });
  if (f.status === "review") {
    const { data } = await db.from("payments").select("order_id").eq("status", "in_review");
    q = q.in("id", (data ?? []).map((r) => r.order_id)).in("status", ["pending_transfer", "rejected"]);
  } else if (f.status) {
    q = q.eq("status", f.status);
  }
  if (f.method) q = q.eq("payment_method", f.method);
  if (f.from) q = q.gte("created_at", startOfDayAR(f.from).toISOString());
  if (f.to) q = q.lt("created_at", new Date(startOfDayAR(f.to).getTime() + 86_400_000).toISOString());
  if (f.min !== undefined) q = q.gte("total", f.min);
  if (f.max !== undefined) q = q.lte("total", f.max);
  if (f.q) {
    const term = f.q.replace(/[%,()#]/g, " ").trim();
    if (/^\d+$/.test(term)) q = q.or(`number.eq.${term},phone.ilike.%${term}%,document.ilike.%${term}%`);
    else if (term) q = q.or(`customer_name.ilike.%${term}%,email.ilike.%${term}%`);
  }
  const { data, count, error } = await q.order("created_at", { ascending: false }).range((page - 1) * perPage, page * perPage - 1);
  if (error) throw error;
  return { orders: (data ?? []) as unknown as OrderListRow[], total: count ?? 0 };
}
