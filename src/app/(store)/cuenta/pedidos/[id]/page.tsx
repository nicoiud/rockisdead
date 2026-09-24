import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import type { Order, OrderItem, OrderStatusHistory } from "@/lib/types";
import { ButtonLink, Card, PageTitle } from "@/components/ui";
import { OrderItemsTable, OrderShippingInfo, OrderStatusBadge, OrderTimeline } from "@/components/orders/order-summary";

export const metadata: Metadata = { title: "Detalle de pedido" };

export default async function MyOrderPage(props: PageProps<"/cuenta/pedidos/[id]">) {
  await requireUser();
  const { id } = await props.params;
  const supabase = await createClient();
  // RLS: solo devuelve el pedido si es del usuario
  const { data: order } = await supabase.from("orders").select("*").eq("id", id).maybeSingle<Order>();
  if (!order) notFound();
  const [{ data: items }, { data: history }] = await Promise.all([
    supabase.from("order_items").select("*").eq("order_id", id),
    supabase.from("order_status_history").select("*").eq("order_id", id).order("created_at"),
  ]);
  const pending = ["pending_payment", "pending_transfer", "rejected"].includes(order.status);

  return (
    <div className="space-y-6">
      <PageTitle actions={pending && <ButtonLink href={`/pedido/${order.id}?t=${order.access_token}`}>Completar pago</ButtonLink>}>
        Pedido #{order.number}
      </PageTitle>
      <p className="text-sm text-neutral-500">
        {formatDate(order.created_at, true)} · <OrderStatusBadge status={order.status} />
      </p>
      <Card title="Productos"><OrderItemsTable order={order} items={(items ?? []) as OrderItem[]} /></Card>
      <div className="grid gap-6 sm:grid-cols-2">
        <Card title="Entrega y pago"><OrderShippingInfo order={order} /></Card>
        <Card title="Seguimiento"><OrderTimeline history={(history ?? []) as OrderStatusHistory[]} /></Card>
      </div>
      <Link href="/cuenta/pedidos" className="text-sm underline">← Volver a mis pedidos</Link>
    </div>
  );
}
