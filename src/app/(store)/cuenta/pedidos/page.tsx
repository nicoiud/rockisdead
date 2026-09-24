import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney } from "@/lib/format";
import type { Order } from "@/lib/types";
import { EmptyState, PageTitle } from "@/components/ui";
import { OrderStatusBadge } from "@/components/orders/order-summary";

export const metadata: Metadata = { title: "Mis pedidos" };

export default async function MyOrdersPage() {
  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
  const orders = (data ?? []) as Order[];

  return (
    <div>
      <PageTitle>Mis pedidos</PageTitle>
      {orders.length === 0 ? (
        <EmptyState>Todavía no hiciste pedidos. <Link href="/productos" className="font-bold underline">Ver productos</Link></EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-black text-left text-xs uppercase">
              <tr><th className="py-2">Pedido</th><th>Fecha</th><th>Estado</th><th className="text-right">Total</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="py-3 font-bold">#{o.number}</td>
                  <td>{formatDate(o.created_at)}</td>
                  <td><OrderStatusBadge status={o.status} /></td>
                  <td className="text-right">{formatMoney(o.total)}</td>
                  <td className="text-right"><Link href={`/cuenta/pedidos/${o.id}`} className="underline">Ver detalle</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
