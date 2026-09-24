import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/settings";
import { syncMercadoPagoPayment } from "@/lib/payments";
import { formatDate, formatMoney, whatsappLink } from "@/lib/format";
import { PAYMENT_STATUS_LABEL } from "@/lib/labels";
import type { Order, OrderItem, OrderStatusHistory, Payment } from "@/lib/types";
import { Alert, Button, Card } from "@/components/ui";
import { OrderItemsTable, OrderShippingInfo, OrderStatusBadge, OrderTimeline } from "@/components/orders/order-summary";
import { canAccessOrder } from "./access";
import { ReceiptUpload } from "./receipt-upload";
import { retryMercadoPago } from "./actions";

export const metadata: Metadata = { title: "Tu pedido", robots: { index: false } };

export default async function OrderPage(props: PageProps<"/pedido/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const token = typeof sp.t === "string" ? sp.t : null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  // Retorno desde Mercado Pago: sincroniza el pago sin esperar al webhook.
  // Se hace antes de leer el pedido (Next memoiza lecturas idénticas en el mismo render).
  // Es inocuo: los datos vienen de la API de MP y solo afectan al pedido referenciado.
  const mpPaymentId = typeof sp.payment_id === "string" ? sp.payment_id : typeof sp.collection_id === "string" ? sp.collection_id : null;
  if (mpPaymentId && /^\d+$/.test(mpPaymentId)) {
    try {
      await syncMercadoPagoPayment(mpPaymentId);
    } catch (e) {
      console.error("[pedido] sync MP", e);
    }
  }

  const db = createAdminClient();
  const { data: order } = await db.from("orders").select("*").eq("id", id).maybeSingle<Order>();
  if (!order || !(await canAccessOrder(order, token))) notFound();

  const [settings, { data: items }, { data: payments }, { data: history }] = await Promise.all([
    getSettings(),
    db.from("order_items").select("*").eq("order_id", id),
    db.from("payments").select("*").eq("order_id", id).order("created_at", { ascending: false }),
    db.from("order_status_history").select("*").eq("order_id", id).order("created_at"),
  ]);
  const lastPayment = (payments?.[0] ?? null) as Payment | null;
  const needsTransfer = order.payment_method === "transfer" && ["pending_transfer", "rejected"].includes(order.status);
  const needsMp = order.payment_method === "mercado_pago" && ["pending_payment", "rejected"].includes(order.status);
  const wa = settings.notify_whatsapp
    ? whatsappLink(settings.whatsapp, `Hola! Tengo una consulta sobre mi pedido #${order.number}`)
    : null;
  const mpStatus = typeof sp.status === "string" ? sp.status : typeof sp.collection_status === "string" ? sp.collection_status : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="text-center">
        <p className="text-sm uppercase text-neutral-500">Pedido</p>
        <h1 className="text-4xl font-black">#{order.number}</h1>
        <p className="mt-2 text-sm text-neutral-500">{formatDate(order.created_at, true)}</p>
        <div className="mt-3"><OrderStatusBadge status={order.status} /></div>
      </div>

      {sp.mp_error && needsMp && (
        <Alert tone="error">No pudimos conectar con Mercado Pago. Tu pedido quedó registrado: intentá pagar de nuevo.</Alert>
      )}
      {mpStatus === "pending" && order.status === "pending_payment" && (
        <Alert tone="warning">Tu pago está pendiente de acreditación. Te avisaremos por email cuando se confirme.</Alert>
      )}
      {["paid", "preparing", "shipped", "delivered"].includes(order.status) && (
        <Alert tone="success">¡Pago confirmado! Te enviamos el detalle a {order.email}.</Alert>
      )}

      {needsMp && (
        <Card title="Pagar con Mercado Pago">
          {order.status === "rejected" && <p className="mb-3 text-sm text-red-600">El pago anterior fue rechazado. Podés intentar con otro medio.</p>}
          <form action={retryMercadoPago}>
            <input type="hidden" name="order_id" value={order.id} />
            <input type="hidden" name="token" value={token ?? ""} />
            <Button type="submit" className="w-full py-3">Pagar {formatMoney(order.total)}</Button>
          </form>
        </Card>
      )}

      {needsTransfer && (
        <Card title="Datos para transferir">
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-neutral-500">Monto</dt><dd className="text-xl font-bold">{formatMoney(order.total)}</dd></div>
            {settings.bank_alias && <div><dt className="text-neutral-500">Alias</dt><dd className="font-mono font-semibold">{settings.bank_alias}</dd></div>}
            {settings.bank_cbu && <div><dt className="text-neutral-500">CBU / CVU</dt><dd className="font-mono">{settings.bank_cbu}</dd></div>}
            {settings.bank_holder && <div><dt className="text-neutral-500">Titular</dt><dd>{settings.bank_holder}</dd></div>}
            {settings.bank_name && <div><dt className="text-neutral-500">Banco</dt><dd>{settings.bank_name}</dd></div>}
            {settings.bank_cuit && <div><dt className="text-neutral-500">CUIT</dt><dd>{settings.bank_cuit}</dd></div>}
          </dl>
          {settings.transfer_instructions && <p className="mt-4 text-sm text-neutral-600">{settings.transfer_instructions}</p>}
          <div className="mt-6 border-t border-neutral-200 pt-4">
            {lastPayment?.status === "in_review" && (
              <Alert tone="neutral">Recibimos tu comprobante el {formatDate(lastPayment.receipt_uploaded_at, true)}. Lo estamos revisando.</Alert>
            )}
            {lastPayment?.status === "rejected" && (
              <Alert tone="error">
                {PAYMENT_STATUS_LABEL.rejected}{lastPayment.review_note ? `: ${lastPayment.review_note}` : ""}. Subí un nuevo comprobante.
              </Alert>
            )}
            <ReceiptUpload orderId={order.id} token={token ?? ""} hasReceipt={!!lastPayment?.receipt_path} />
          </div>
        </Card>
      )}

      <Card title="Resumen">
        <OrderItemsTable order={order} items={(items ?? []) as OrderItem[]} />
      </Card>
      <div className="grid gap-6 sm:grid-cols-2">
        <Card title="Entrega y pago"><OrderShippingInfo order={order} /></Card>
        <Card title="Historial"><OrderTimeline history={(history ?? []) as OrderStatusHistory[]} /></Card>
      </div>
      {wa && (
        <p className="text-center text-sm">
          ¿Dudas? <a href={wa} target="_blank" rel="noreferrer" className="font-bold underline">Escribinos por WhatsApp</a>
        </p>
      )}
    </div>
  );
}
