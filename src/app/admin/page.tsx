import Link from "next/link";
import { getProfile, hasPermission } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/settings";
import { resolveRange } from "@/lib/dates";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/labels";
import { salesSeries, salesTotals, visitSeries, visitTotals } from "@/lib/reports";
import type { Order } from "@/lib/types";
import { Alert, Card, EmptyState, PageTitle } from "@/components/ui";
import { Stat } from "@/components/admin/stat";
import { TimeSeriesChart } from "@/components/admin/charts";
import { OrderStatusBadge } from "@/components/orders/order-summary";

export default async function DashboardPage(props: PageProps<"/admin">) {
  const profile = (await getProfile())!;
  const sp = await props.searchParams;
  const canSales = hasPermission(profile, "reports");
  const canVisits = hasPermission(profile, "analytics");
  const canOrders = hasPermission(profile, "orders");
  const canProducts = hasPermission(profile, "products");

  const today = resolveRange("today");
  const week = resolveRange("7d");
  const month = resolveRange("30d");
  const db = createAdminClient();
  const settings = await getSettings();

  const [sToday, sWeek, sMonth, salesChart, vToday, vWeek, vMonth, visitsChart, pendingRes, lowRes] = await Promise.all([
    canSales ? salesTotals(today.from, today.to) : null,
    canSales ? salesTotals(week.from, week.to) : null,
    canSales ? salesTotals(month.from, month.to) : null,
    canSales ? salesSeries(month, {}, "revenue", true) : null,
    canVisits ? visitTotals(today.from, today.to) : null,
    canVisits ? visitTotals(week.from, week.to) : null,
    canVisits ? visitTotals(month.from, month.to) : null,
    canVisits ? visitSeries(month) : null,
    canOrders
      ? db.from("orders").select("*, payments(status, receipt_path)").in("status", ["pending_transfer", "pending_payment"]).order("created_at", { ascending: false }).limit(10)
      : null,
    canProducts
      ? db
          .from("product_variants")
          .select("id, title, sku, stock, products!inner(id, name, status)")
          .eq("active", true)
          .eq("products.status", "active")
          .lte("stock", settings.low_stock_threshold)
          .order("stock")
          .limit(15)
      : null,
  ]);

  const pending = (pendingRes?.data ?? []) as (Order & { payments: { status: string; receipt_path: string | null }[] })[];
  const low = (lowRes?.data ?? []) as unknown as { id: string; title: string; sku: string | null; stock: number; products: { id: string; name: string } }[];

  return (
    <div className="space-y-6">
      <PageTitle>Dashboard</PageTitle>
      {sp.error === "permiso" && <Alert tone="error">No tenés permiso para esa sección.</Alert>}

      {canSales && sToday && sWeek && sMonth && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Ventas hoy" value={formatMoney(sToday.billed)} hint={`${sToday.orders} pedido(s)`} />
            <Stat label="Últimos 7 días" value={formatMoney(sWeek.billed)} hint={`${sWeek.orders} pedido(s)`} />
            <Stat label="Últimos 30 días" value={formatMoney(sMonth.billed)} hint={`${sMonth.orders} pedido(s)`} />
            <Stat label="Ticket promedio (30 días)" value={formatMoney(sMonth.avg_ticket)} />
          </div>
          <Card title="Ventas últimos 30 días" actions={<Link href="/admin/reportes" className="text-xs underline">Ver reportes</Link>}>
            <TimeSeriesChart data={salesChart ?? []} format="money" seriesLabel="Ventas" previousLabel="30 días anteriores" />
          </Card>
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {canOrders && (
          <Card title={`Pendientes de pago (${pending.length})`} actions={<Link href="/admin/pedidos?estado=pending_transfer" className="text-xs underline">Ver todos</Link>}>
            {pending.length === 0 ? (
              <EmptyState>No hay pedidos pendientes.</EmptyState>
            ) : (
              <ul className="divide-y divide-neutral-200 text-sm">
                {pending.map((o) => {
                  const review = o.payments?.some((p) => p.status === "in_review");
                  return (
                    <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                      <Link href={`/admin/pedidos/${o.id}`} className="font-bold underline">#{o.number}</Link>
                      <span className="flex-1 truncate">{o.customer_name}</span>
                      <span className="text-xs text-neutral-500">{PAYMENT_METHOD_LABEL[o.payment_method]}</span>
                      {review ? <span className="text-xs font-bold text-blue-700">{PAYMENT_STATUS_LABEL.in_review}</span> : <OrderStatusBadge status={o.status} />}
                      <span className="w-24 text-right">{formatMoney(o.total)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}

        {canProducts && (
          <Card title={`Stock bajo (≤ ${settings.low_stock_threshold})`} actions={<Link href="/admin/productos?stock=low" className="text-xs underline">Ver productos</Link>}>
            {low.length === 0 ? (
              <EmptyState>Todo con stock.</EmptyState>
            ) : (
              <ul className="divide-y divide-neutral-200 text-sm">
                {low.map((v) => (
                  <li key={v.id} className="flex justify-between gap-2 py-2">
                    <Link href={`/admin/productos/${v.products.id}`} className="truncate underline">
                      {v.products.name}{v.title && ` — ${v.title}`}
                    </Link>
                    <span className={v.stock <= 0 ? "font-bold text-red-600" : "font-bold"}>{v.stock}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      {canVisits && vToday && vWeek && vMonth && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Visitas hoy" value={formatNumber(vToday.views)} hint={`${vToday.visitors} visitantes`} />
            <Stat label="Visitas 7 días" value={formatNumber(vWeek.views)} hint={`${vWeek.visitors} visitantes`} />
            <Stat label="Visitas 30 días" value={formatNumber(vMonth.views)} hint={`${vMonth.visitors} visitantes`} />
            <Stat label="Conversión 30 días" value={`${vMonth.conversion}%`} hint="Pedidos pagados / visitantes" />
          </div>
          <Card title="Visitas últimos 30 días" actions={<Link href="/admin/visitas" className="text-xs underline">Ver analítica</Link>}>
            <TimeSeriesChart data={visitsChart ?? []} seriesLabel="Visitas" />
          </Card>
        </>
      )}
      <p className="text-xs text-neutral-400">Actualizado {formatDate(new Date(), true)}</p>
    </div>
  );
}
