import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { pctChange, resolveRange } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { SOURCE_LABEL } from "@/lib/labels";
import { visitSeries, visitTotals, type VisitFilters } from "@/lib/reports";
import { Card, Input, PageTitle, Select } from "@/components/ui";
import { RangeFilter } from "@/components/admin/range-filter";
import { Stat } from "@/components/admin/stat";
import { BarList, TimeSeriesChart } from "@/components/admin/charts";

export const metadata: Metadata = { title: "Visitas" };

export default async function VisitsPage(props: PageProps<"/admin/visitas">) {
  await requireStaff("analytics");
  const sp = await props.searchParams;
  const s = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  const range = resolveRange(s("rango") ?? "30d", s("desde"), s("hasta"));
  const audience = s("usuarios") === "logged" || s("usuarios") === "guest" ? (s("usuarios") as "logged" | "guest") : "all";
  const filters: VisitFilters = {
    path: s("pagina") ?? null,
    product: s("producto") ?? null,
    audience,
    source: s("origen") ?? null,
  };
  const metric = s("metrica") === "visitors" ? "visitors" : "views";
  const db = createAdminClient();
  const args = { p_from: range.from.toISOString(), p_to: range.to.toISOString(), p_audience: audience };

  const [cur, prev, series, topPages, sources, { data: prods }] = await Promise.all([
    visitTotals(range.from, range.to, filters),
    visitTotals(range.prevFrom, range.prevTo, filters),
    visitSeries(range, filters, metric),
    db.rpc("report_top_pages", { ...args, p_source: filters.source, p_limit: 20 }),
    db.rpc("report_visit_sources", { ...args, p_path: filters.path, p_product: filters.product }),
    db.from("products").select("id, name").order("name"),
  ]);
  const pages = (topPages.data ?? []) as { path: string; product_name: string | null; views: number; visitors: number }[];
  const srcRows = (sources.data ?? []) as { source: string; views: number; visitors: number }[];

  return (
    <div className="space-y-6">
      <PageTitle>Visitas</PageTitle>
      <RangeFilter range={range}>
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase">Página</span>
          <Input name="pagina" defaultValue={filters.path ?? ""} placeholder="/productos* o /carrito" className="w-44" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase">Producto</span>
          <Select name="producto" defaultValue={filters.product ?? ""} className="w-48">
            <option value="">Todos</option>
            {(prods ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase">Usuarios</span>
          <Select name="usuarios" defaultValue={audience} className="w-36">
            <option value="all">Todos</option>
            <option value="logged">Logueados</option>
            <option value="guest">Invitados</option>
          </Select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase">Origen</span>
          <Select name="origen" defaultValue={filters.source ?? ""} className="w-40">
            <option value="">Todos</option>
            {Object.entries(SOURCE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase">Gráfico</span>
          <Select name="metrica" defaultValue={metric} className="w-36">
            <option value="views">Visitas</option>
            <option value="visitors">Visitantes únicos</option>
          </Select>
        </label>
      </RangeFilter>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Visitas (páginas vistas)" value={formatNumber(cur.views)} change={pctChange(cur.views, prev.views)} />
        <Stat label="Visitantes únicos" value={formatNumber(cur.visitors)} change={pctChange(cur.visitors, prev.visitors)} />
        <Stat label="Logueados / invitados" value={`${formatNumber(cur.logged_views)} / ${formatNumber(cur.guest_views)}`} />
        <Stat label="Conversión" value={`${cur.conversion}%`} change={pctChange(cur.conversion, prev.conversion)} hint={`${cur.orders} pedidos pagados / visitantes únicos`} />
      </div>

      <Card title={metric === "views" ? "Visitas en el tiempo" : "Visitantes únicos en el tiempo"}>
        <TimeSeriesChart data={series} seriesLabel={metric === "views" ? "Visitas" : "Visitantes"} height={280} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Páginas más vistas">
          <BarList data={pages.map((p) => ({ label: p.product_name ? `${p.product_name} (${p.path})` : p.path, value: Number(p.views), sub: `${p.visitors} únicos` }))} />
        </Card>
        <Card title="Origen del tráfico">
          <BarList data={srcRows.map((r) => ({ label: SOURCE_LABEL[r.source] ?? r.source, value: Number(r.views), sub: `${r.visitors} únicos` }))} />
        </Card>
      </div>
      <p className="text-xs text-neutral-500">
        Las visitas del staff no se cuentan. El origen se detecta por el referrer y los parámetros UTM (ej. links de Instagram con ?utm_source=instagram).
      </p>
    </div>
  );
}
