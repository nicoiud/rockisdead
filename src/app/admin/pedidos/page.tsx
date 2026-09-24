import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { listOrders, orderFiltersFromParams, orderFiltersToParams } from "@/lib/admin-orders";
import { formatDate, formatMoney } from "@/lib/format";
import { ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/labels";
import { Button, ButtonLink, EmptyState, Input, PageTitle, Select } from "@/components/ui";
import { OrderStatusBadge } from "@/components/orders/order-summary";

export const metadata: Metadata = { title: "Pedidos" };

export default async function OrdersPage(props: PageProps<"/admin/pedidos">) {
  await requireStaff("orders");
  const sp = await props.searchParams;
  const filters = orderFiltersFromParams(sp);
  const page = Number(typeof sp.pagina === "string" ? sp.pagina : 1) || 1;
  const perPage = 50;
  const { orders, total } = await listOrders(filters, page, perPage);
  const query = orderFiltersToParams(filters).toString();
  const pages = Math.ceil(total / perPage);
  const sum = orders.reduce((s, o) => s + Number(o.total), 0);

  return (
    <div>
      <PageTitle
        actions={
          <>
            <ButtonLink href={`/admin/pedidos/exportar?formato=xlsx${query ? `&${query}` : ""}`} prefetch={false} variant="secondary">Exportar Excel</ButtonLink>
            <ButtonLink href={`/admin/pedidos/exportar?formato=csv${query ? `&${query}` : ""}`} prefetch={false} variant="secondary">Exportar CSV</ButtonLink>
          </>
        }
      >
        Pedidos
      </PageTitle>

      <form className="mb-4 grid gap-3 border border-neutral-200 bg-white p-3 sm:grid-cols-4 lg:grid-cols-8">
        <Input name="q" placeholder="Cliente, email, # o teléfono" defaultValue={filters.q} className="lg:col-span-2" />
        <Select name="estado" defaultValue={filters.status ?? ""}>
          <option value="">Todos los estados</option>
          <option value="review">Comprobante a revisar</option>
          {Object.entries(ORDER_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <Select name="metodo" defaultValue={filters.method ?? ""}>
          <option value="">Todos los pagos</option>
          {Object.entries(PAYMENT_METHOD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <Input type="date" name="desde" defaultValue={filters.from} title="Desde" />
        <Input type="date" name="hasta" defaultValue={filters.to} title="Hasta" />
        <div className="flex gap-2">
          <Input name="min" type="number" min={0} placeholder="$ mín" defaultValue={filters.min} />
          <Input name="max" type="number" min={0} placeholder="$ máx" defaultValue={filters.max} />
        </div>
        <div className="flex gap-2">
          <Button type="submit">Filtrar</Button>
          <Link href="/admin/pedidos" className="self-center text-xs underline">Limpiar</Link>
        </div>
      </form>

      {orders.length === 0 ? (
        <EmptyState>No hay pedidos con esos filtros.</EmptyState>
      ) : (
        <div className="overflow-x-auto border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase">
              <tr>
                <th className="p-2">#</th><th className="p-2">Fecha</th><th className="p-2">Cliente</th><th className="p-2">Pago</th>
                <th className="p-2">Estado</th><th className="p-2">Envío</th><th className="p-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {orders.map((o) => {
                const review = o.payments?.some((p) => p.status === "in_review");
                return (
                  <tr key={o.id} className="hover:bg-neutral-50">
                    <td className="p-2 font-bold"><Link href={`/admin/pedidos/${o.id}`} className="underline">#{o.number}</Link></td>
                    <td className="p-2 whitespace-nowrap">{formatDate(o.created_at, true)}</td>
                    <td className="p-2">
                      <span className="block">{o.customer_name}</span>
                      <span className="text-xs text-neutral-500">{o.email}{!o.user_id && " · invitado"}</span>
                    </td>
                    <td className="p-2">
                      {PAYMENT_METHOD_LABEL[o.payment_method]}
                      {review && <span className="block text-xs font-bold text-blue-700">{PAYMENT_STATUS_LABEL.in_review}</span>}
                    </td>
                    <td className="p-2"><OrderStatusBadge status={o.status} /></td>
                    <td className="p-2 text-xs">{o.shipping_method_name}</td>
                    <td className="p-2 text-right font-semibold tabular-nums">{formatMoney(o.total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-neutral-500">{total} pedido(s) · total de esta página {formatMoney(sum)}</p>
      {pages > 1 && (
        <nav className="mt-4 flex flex-wrap gap-1 text-sm">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Link key={p} href={`/admin/pedidos?${query}${query ? "&" : ""}pagina=${p}`} className={`border px-3 py-1 ${p === page ? "border-black bg-black text-white" : "border-neutral-300 bg-white"}`}>
              {p}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
