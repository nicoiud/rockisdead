import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { pctChange, resolveRange } from "@/lib/dates";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { PAYMENT_METHOD_LABEL } from "@/lib/labels";
import { salesSeries, salesTotals, type SalesFilters } from "@/lib/reports";
import type { PaymentMethod } from "@/lib/types";
import { Card, PageTitle, Select } from "@/components/ui";
import { RangeFilter } from "@/components/admin/range-filter";
import { Stat } from "@/components/admin/stat";
import { BarList, TimeSeriesChart } from "@/components/admin/charts";

export const metadata: Metadata = { title: "Ventas" };

const METRICS = { revenue: "Ventas ($)", orders: "Pedidos", units: "Unidades" } as const;

export default async function ReportsPage(props: PageProps<"/admin/reportes">) {
  await requireStaff("reports");
  const sp = await props.searchParams;
  const s = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  const range = resolveRange(s("rango") ?? "30d", s("desde"), s("hasta"));
  const method = s("metodo") === "mercado_pago" || s("metodo") === "transfer" ? (s("metodo") as PaymentMethod) : null;
  const filters: SalesFilters = { category: s("categoria") ?? null, product: s("producto") ?? null, method };
  const metric = (s("metrica") as keyof typeof METRICS) in METRICS ? (s("metrica") as keyof typeof METRICS) : "revenue";

  const db = createAdminClient();
  const rpcArgs = { p_from: range.from.toISOString(), p_to: range.to.toISOString() };
  const [cur, prev, series, top, byCategory, byMethod, { data: cats }, { data: prods }] = await Promise.all([
    salesTotals(range.from, range.to, filters),
    salesTotals(range.prevFrom, range.prevTo, filters),
    salesSeries(range, filters, metric, true),
    db.rpc("report_top_products", { ...rpcArgs, p_category: filters.category, p_method: method, p_limit: 15 }),
    db.rpc("report_sales_by_category", { ...rpcArgs, p_method: method }),
    db.rpc("report_sales_by_method", rpcArgs),
    db.from("categories").select("id, name").order("name"),
    db.from("products").select("id, name").order("name"),
  ]);
  const topRows = (top.data ?? []) as { product_id: string; product_name: string; units: number; revenue: number }[];
  const catRows = (byCategory.data ?? []) as { category_name: string; units: number; revenue: number }[];
  const methodRows = (byMethod.data ?? []) as { payment_method: PaymentMethod; orders: number; billed: number }[];
  const itemFiltered = !!(filters.category || filters.product);

  return (
    <div className="space-y-6">
      <PageTitle>Ventas</PageTitle>
      <RangeFilter range={range}>
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase">Categoría</span>
          <Select name="categoria" defaultValue={filters.category ?? ""} className="w-44">
            <option value="">Todas</option>
            {(cats ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase">Producto</span>
          <Select name="producto" defaultValue={filters.product ?? ""} className="w-52">
            <option value="">Todos</option>
            {(prods ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase">Pago</span>
          <Select name="metodo" defaultValue={method ?? ""} className="w-40">
            <option value="">Todos</option>
            {Object.entries(PAYMENT_METHOD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase">Gráfico</span>
          <Select name="metrica" defaultValue={metric} className="w-36">
            {Object.entries(METRICS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </label>
      </RangeFilter>

      <p className="text-sm text-neutral-500">
        {formatDate(range.from)} al {range.toYmd.split("-").reverse().join("/")} · comparado con {formatDate(range.prevFrom)} al{" "}
        {formatDate(new Date(range.prevTo.getTime() - 1))}. Se cuentan pedidos pagados, por fecha de pago.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label={itemFiltered ? "Ventas de productos" : "Facturación"} value={formatMoney(itemFiltered ? cur.revenue : cur.billed)} change={pctChange(itemFiltered ? cur.revenue : cur.billed, itemFiltered ? prev.revenue : prev.billed)} />
        <Stat label="Pedidos" value={formatNumber(cur.orders)} change={pctChange(cur.orders, prev.orders)} />
        <Stat label="Unidades" value={formatNumber(cur.units)} change={pctChange(cur.units, prev.units)} />
        <Stat label="Ticket promedio" value={formatMoney(cur.avg_ticket)} change={pctChange(cur.avg_ticket, prev.avg_ticket)} />
        <Stat label="Ventas productos (sin envío)" value={formatMoney(cur.revenue)} change={pctChange(cur.revenue, prev.revenue)} />
      </div>

      <Card title={`${METRICS[metric]} en el tiempo`}>
        <TimeSeriesChart data={series} format={metric === "revenue" ? "money" : "number"} seriesLabel="Período actual" previousLabel="Período anterior" height={300} />
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-xs uppercase text-neutral-500">Ver tabla</summary>
          <table className="mt-2 w-full text-xs">
            <thead><tr className="text-left"><th>Período</th><th className="text-right">Actual</th><th className="text-right">Anterior</th></tr></thead>
            <tbody>
              {series.map((p) => (
                <tr key={p.label} className="border-t border-neutral-100">
                  <td>{p.label}</td>
                  <td className="text-right">{metric === "revenue" ? formatMoney(p.value) : p.value}</td>
                  <td className="text-right">{metric === "revenue" ? formatMoney(p.previous ?? 0) : p.previous}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Productos más vendidos">
          <BarList data={topRows.map((r) => ({ label: r.product_name, value: Number(r.units), sub: formatMoney(r.revenue) }))} />
        </Card>
        <Card title="Ingresos por categoría">
          <BarList format="money" data={catRows.map((r) => ({ label: r.category_name, value: Number(r.revenue), sub: `${r.units} u.` }))} />
        </Card>
      </div>

      <Card title="Por método de pago">
        <BarList
          format="money"
          data={methodRows.map((r) => ({ label: PAYMENT_METHOD_LABEL[r.payment_method], value: Number(r.billed), sub: `${r.orders} pedidos` }))}
        />
      </Card>
    </div>
  );
}
