import { formatDate, formatMoney } from "@/lib/format";
import { ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/labels";
import type { Order, OrderItem, OrderStatus, OrderStatusHistory } from "@/lib/types";
import { Badge } from "@/components/ui";

const TONE: Record<OrderStatus, "neutral" | "green" | "yellow" | "red" | "blue"> = {
  pending_payment: "yellow",
  pending_transfer: "yellow",
  paid: "green",
  preparing: "blue",
  shipped: "blue",
  delivered: "green",
  cancelled: "red",
  rejected: "red",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={TONE[status]}>{ORDER_STATUS_LABEL[status]}</Badge>;
}

export function OrderItemsTable({ order, items }: { order: Order; items: OrderItem[] }) {
  return (
    <div>
      <ul className="divide-y divide-neutral-200">
        {items.map((it) => (
          <li key={it.id} className="flex gap-3 py-3 text-sm">
            <div className="h-16 w-12 shrink-0 bg-neutral-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {it.image_url && <img src={it.image_url} alt="" className="h-full w-full object-cover" />}
            </div>
            <div className="flex-1">
              <p className="font-semibold">{it.product_name}</p>
              <p className="text-neutral-500">
                {it.variant_title && `${it.variant_title} · `}
                {it.quantity} × {formatMoney(it.unit_price)}
                {it.sku && <span className="ml-2 text-xs">SKU {it.sku}</span>}
              </p>
            </div>
            <p className="font-semibold">{formatMoney(Number(it.unit_price) * it.quantity)}</p>
          </li>
        ))}
      </ul>
      <dl className="space-y-1 border-t border-neutral-200 pt-3 text-sm">
        <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatMoney(order.subtotal)}</dd></div>
        {Number(order.discount) > 0 && (
          <div className="flex justify-between text-green-700"><dt>Descuento</dt><dd>-{formatMoney(order.discount)}</dd></div>
        )}
        <div className="flex justify-between">
          <dt>Envío ({order.shipping_method_name})</dt>
          <dd>{Number(order.shipping_cost) ? formatMoney(order.shipping_cost) : "Gratis"}</dd>
        </div>
        <div className="flex justify-between text-lg font-bold"><dt>Total</dt><dd>{formatMoney(order.total)}</dd></div>
      </dl>
    </div>
  );
}

export function OrderShippingInfo({ order }: { order: Order }) {
  const a = order.shipping_address;
  return (
    <div className="space-y-1 text-sm">
      <p><span className="font-semibold">Pago:</span> {PAYMENT_METHOD_LABEL[order.payment_method]}</p>
      <p><span className="font-semibold">Entrega:</span> {order.shipping_method_name}</p>
      {a && (
        <p>
          {a.recipient}<br />
          {a.street} {a.number}{a.apartment ? `, ${a.apartment}` : ""}<br />
          {a.city}, {a.province} ({a.postal_code})
          {a.notes && <><br /><span className="text-neutral-500">{a.notes}</span></>}
        </p>
      )}
      {order.tracking_code && <p><span className="font-semibold">Seguimiento:</span> {order.tracking_code}</p>}
    </div>
  );
}

export function OrderTimeline({ history }: { history: OrderStatusHistory[] }) {
  return (
    <ol className="space-y-2 text-sm">
      {history.map((h) => (
        <li key={h.id} className="flex gap-3">
          <span className="w-32 shrink-0 text-neutral-500">{formatDate(h.created_at, true)}</span>
          <span>
            <span className="font-semibold">{ORDER_STATUS_LABEL[h.status]}</span>
            {h.note && <span className="text-neutral-600"> — {h.note}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
