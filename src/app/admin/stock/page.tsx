import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/format";
import { resolveRange } from "@/lib/dates";
import { STOCK_REASON_LABEL } from "@/lib/labels";
import type { StockReason } from "@/lib/types";
import { Card, EmptyState, PageTitle, Select } from "@/components/ui";
import { RangeFilter } from "@/components/admin/range-filter";
import { AdjustStockForm } from "./adjust-form";

export const metadata: Metadata = { title: "Stock" };

type Movement = {
  id: number; delta: number; stock_after: number; reason: StockReason; note: string | null; created_at: string; order_id: string | null;
  product_variants: { id: string; title: string; sku: string | null; products: { id: string; name: string } } | null;
  profiles: { email: string } | null;
};

export default async function StockPage(props: PageProps<"/admin/stock">) {
  await requireStaff("products");
  const sp = await props.searchParams;
  const s = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  const range = resolveRange(s("rango") ?? "30d", s("desde"), s("hasta"));
  const productId = s("producto");
  const reason = s("motivo");
  const db = createAdminClient();

  let q = db
    .from("stock_movements")
    .select("id, delta, stock_after, reason, note, created_at, order_id, product_variants!inner(id, title, sku, product_id, products(id, name)), profiles(email)")
    .gte("created_at", range.from.toISOString())
    .lt("created_at", range.to.toISOString())
    .order("created_at", { ascending: false })
    .limit(500);
  if (productId) q = q.eq("product_variants.product_id", productId);
  if (reason) q = q.eq("reason", reason);

  const [{ data: movements }, { data: variants }, { data: products }] = await Promise.all([
    q,
    db.from("product_variants").select("id, title, sku, stock, products(name)").order("product_id").limit(5000),
    db.from("products").select("id, name").order("name"),
  ]);
  const rows = (movements ?? []) as unknown as Movement[];
  const variantOptions = ((variants ?? []) as unknown as { id: string; title: string; sku: string | null; stock: number; products: { name: string } }[])
    .map((v) => ({ id: v.id, stock: v.stock, label: `${v.products.name}${v.title ? ` — ${v.title}` : ""}${v.sku ? ` [${v.sku}]` : ""}` }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="space-y-6">
      <PageTitle>Stock</PageTitle>
      <Card title="Ajuste manual"><AdjustStockForm variants={variantOptions} /></Card>

      <RangeFilter range={range}>
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase">Producto</span>
          <Select name="producto" defaultValue={productId ?? ""} className="w-56">
            <option value="">Todos</option>
            {(products ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase">Motivo</span>
          <Select name="motivo" defaultValue={reason ?? ""} className="w-40">
            <option value="">Todos</option>
            {Object.entries(STOCK_REASON_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </label>
      </RangeFilter>

      <Card title={`Movimientos (${rows.length}${rows.length === 500 ? "+" : ""})`}>
        {rows.length === 0 ? (
          <EmptyState>Sin movimientos en el período.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-neutral-500">
                <tr><th className="p-2">Fecha</th><th className="p-2">Producto</th><th className="p-2">Motivo</th><th className="p-2 text-right">Cambio</th><th className="p-2 text-right">Stock</th><th className="p-2">Detalle</th><th className="p-2">Usuario</th></tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((m) => (
                  <tr key={m.id}>
                    <td className="p-2 whitespace-nowrap">{formatDate(m.created_at, true)}</td>
                    <td className="p-2">
                      {m.product_variants && (
                        <Link href={`/admin/productos/${m.product_variants.products.id}`} className="underline">
                          {m.product_variants.products.name}{m.product_variants.title && ` — ${m.product_variants.title}`}
                        </Link>
                      )}
                    </td>
                    <td className="p-2">{STOCK_REASON_LABEL[m.reason]}</td>
                    <td className={`p-2 text-right font-semibold tabular-nums ${m.delta > 0 ? "text-green-700" : "text-red-700"}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                    <td className="p-2 text-right tabular-nums">{m.stock_after}</td>
                    <td className="p-2 text-xs">
                      {m.order_id && <Link href={`/admin/pedidos/${m.order_id}`} className="underline">Ver pedido</Link>} {m.note}
                    </td>
                    <td className="p-2 text-xs text-neutral-500">{m.profiles?.email ?? "Sistema"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
