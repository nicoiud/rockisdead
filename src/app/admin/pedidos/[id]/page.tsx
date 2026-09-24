import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/settings";
import { formatDate, formatMoney, whatsappLink } from "@/lib/format";
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/labels";
import { orderPublicUrl } from "@/lib/notifications";
import type { Order, OrderItem, OrderStatusHistory, Payment } from "@/lib/types";
import { Badge, Card, PageTitle } from "@/components/ui";
import { OrderItemsTable, OrderShippingInfo, OrderStatusBadge, OrderTimeline } from "@/components/orders/order-summary";
import { NoteForm, StatusForm, TransferReview } from "./forms";

export const metadata: Metadata = { title: "Pedido" };

export default async function AdminOrderPage(props: PageProps<"/admin/pedidos/[id]">) {
  await requireStaff("orders");
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = createAdminClient();
  const { data: order } = await db.from("orders").select("*").eq("id", id).maybeSingle<Order>();
  if (!order) notFound();
  const [settings, { data: items }, { data: payments }, { data: history }, { count: customerOrders }] = await Promise.all([
    getSettings(),
    db.from("order_items").select("*").eq("order_id", id),
    db.from("payments").select("*").eq("order_id", id).order("created_at", { ascending: false }),
    db.from("order_status_history").select("*").eq("order_id", id).order("created_at"),
    db.from("orders").select("id", { count: "exact", head: true }).eq("email", order.email),
  ]);
  const pays = (payments ?? []) as Payment[];

  // URLs firmadas (1 hora) para ver comprobantes privados
  const receipts = await Promise.all(
    pays.filter((p) => p.receipt_path).map(async (p) => {
      const { data } = await db.storage.from("receipts").createSignedUrl(p.receipt_path!, 3600);
      return { payment: p, url: data?.signedUrl ?? null };
    }),
  );
  const canReview = order.payment_method === "transfer" && ["pending_transfer", "rejected"].includes(order.status);
  const wa = whatsappLink(order.phone, `Hola ${order.customer_name.split(" ")[0]}! Te escribimos de ${settings.store_name} por tu pedido #${order.number}.`);

  return (
    <div className="space-y-6">
      <PageTitle actions={<Link href="/admin/pedidos" className="text-sm underline">← Pedidos</Link>}>
        Pedido #{order.number} <OrderStatusBadge status={order.status} />
      </PageTitle>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card title="Productos"><OrderItemsTable order={order} items={(items ?? []) as OrderItem[]} /></Card>

          <div className="grid gap-6 sm:grid-cols-2">
            <Card title="Cliente">
              <div className="space-y-1 text-sm">
                <p className="font-semibold">{order.customer_name}</p>
                <p><a href={`mailto:${order.email}`} className="underline">{order.email}</a></p>
                {order.phone && <p>{order.phone}</p>}
                {order.document && <p>DNI/CUIT: {order.document}</p>}
                <p className="text-xs text-neutral-500">
                  {order.user_id ? (
                    <Link href={`/admin/usuarios/${order.user_id}`} className="underline">Cliente registrado</Link>
                  ) : "Compró como invitado"}{" · "}
                  <Link href={`/admin/pedidos?q=${encodeURIComponent(order.email)}`} className="underline">{customerOrders ?? 1} pedido(s)</Link>
                </p>
                {wa && <a href={wa} target="_blank" rel="noreferrer" className="inline-block bg-green-600 px-3 py-1 text-xs font-bold uppercase text-white">WhatsApp</a>}
              </div>
            </Card>
            <Card title="Entrega"><OrderShippingInfo order={order} /></Card>
          </div>

          {order.notes && <Card title="Notas del cliente"><p className="text-sm">{order.notes}</p></Card>}

          <Card title="Pagos">
            {pays.length === 0 ? <p className="text-sm text-neutral-500">Sin registros de pago.</p> : (
              <ul className="divide-y divide-neutral-100 text-sm">
                {pays.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 py-2">
                    <span className="font-semibold">{PAYMENT_METHOD_LABEL[p.method]}</span>
                    <Badge tone={p.status === "approved" ? "green" : p.status === "rejected" ? "red" : p.status === "in_review" ? "blue" : "yellow"}>
                      {PAYMENT_STATUS_LABEL[p.status]}
                    </Badge>
                    <span>{formatMoney(p.amount)}</span>
                    {p.mp_payment_id && <span className="text-xs text-neutral-500">MP #{p.mp_payment_id} ({p.mp_status_detail})</span>}
                    {p.review_note && <span className="text-xs text-red-600">{p.review_note}</span>}
                    <span className="ml-auto text-xs text-neutral-500">{formatDate(p.created_at, true)}</span>
                  </li>
                ))}
              </ul>
            )}
            {receipts.length > 0 && (
              <div className="mt-4 space-y-3 border-t border-neutral-200 pt-4">
                <p className="text-xs font-semibold uppercase">Comprobantes</p>
                {receipts.map(({ payment, url }) =>
                  url ? (
                    <div key={payment.id} className="space-y-1">
                      <a href={url} target="_blank" rel="noreferrer" className="text-sm underline">
                        Ver comprobante ({formatDate(payment.receipt_uploaded_at, true)}) ↗
                      </a>
                      {!payment.receipt_path?.endsWith(".pdf") && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt="Comprobante" className="max-h-96 border border-neutral-200" />
                      )}
                    </div>
                  ) : null,
                )}
              </div>
            )}
          </Card>

          <Card title="Historial">
            <OrderTimeline history={(history ?? []) as OrderStatusHistory[]} />
            <div className="mt-4 border-t border-neutral-200 pt-4"><NoteForm orderId={order.id} /></div>
          </Card>
        </div>

        <div className="space-y-6">
          {canReview && (
            <Card title="Revisar transferencia">
              <p className="mb-3 text-sm">Verificá que ingresó <strong>{formatMoney(order.total)}</strong> antes de confirmar.</p>
              <TransferReview orderId={order.id} />
            </Card>
          )}
          <Card title="Estado del pedido">
            <StatusForm key={order.updated_at} orderId={order.id} status={order.status} tracking={order.tracking_code} />
          </Card>
          <Card title="Info">
            <dl className="space-y-1 text-xs">
              <div className="flex justify-between"><dt>Creado</dt><dd>{formatDate(order.created_at, true)}</dd></div>
              <div className="flex justify-between"><dt>Pagado</dt><dd>{formatDate(order.paid_at, true)}</dd></div>
              <div className="flex justify-between"><dt>Stock descontado</dt><dd>{order.stock_applied ? "Sí" : "No"}</dd></div>
            </dl>
            <p className="mt-3 break-all text-xs text-neutral-500">
              Link del cliente: <a href={orderPublicUrl(order)} target="_blank" rel="noreferrer" className="underline">abrir</a>
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
