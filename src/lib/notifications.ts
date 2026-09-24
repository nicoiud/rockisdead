import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { emailButton, emailLayout, escapeHtml, sendEmail } from "@/lib/email";
import { formatDate, formatMoney, whatsappLink } from "@/lib/format";
import { ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/labels";
import type { Order, OrderItem, OrderStatus, StoreSettings } from "@/lib/types";

async function loadOrder(orderId: string) {
  const db = createAdminClient();
  const { data: order } = await db.from("orders").select("*").eq("id", orderId).single();
  const { data: items } = await db.from("order_items").select("*").eq("order_id", orderId);
  return { order: order as Order, items: (items ?? []) as OrderItem[] };
}

export function orderPublicUrl(order: Pick<Order, "id" | "access_token">): string {
  return `${siteUrl()}/pedido/${order.id}?t=${order.access_token}`;
}

function itemsTable(order: Order, items: OrderItem[]): string {
  const rows = items
    .map(
      (it) => `<tr>
<td style="padding:8px 0;border-bottom:1px solid #eee">${escapeHtml(it.product_name)}${it.variant_title ? `<br><small style="color:#666">${escapeHtml(it.variant_title)}</small>` : ""}</td>
<td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center">${it.quantity}</td>
<td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">${formatMoney(Number(it.unit_price) * it.quantity)}</td></tr>`,
    )
    .join("");
  const line = (label: string, value: string, bold = false) =>
    `<tr><td colspan="2" style="padding:4px 0;${bold ? "font-weight:bold" : ""}">${label}</td><td style="padding:4px 0;text-align:right;${bold ? "font-weight:bold" : ""}">${value}</td></tr>`;
  return `<table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
<tr><th align="left">Producto</th><th>Cant.</th><th align="right">Subtotal</th></tr>${rows}
${line("Subtotal", formatMoney(order.subtotal))}
${Number(order.discount) > 0 ? line("Descuento", "-" + formatMoney(order.discount)) : ""}
${line(`Envío (${escapeHtml(order.shipping_method_name)})`, Number(order.shipping_cost) > 0 ? formatMoney(order.shipping_cost) : "Gratis")}
${line("Total", formatMoney(order.total), true)}
</table>`;
}

function addressBlock(order: Order): string {
  const a = order.shipping_address;
  if (!a) return `<p><strong>Entrega:</strong> ${escapeHtml(order.shipping_method_name)}</p>`;
  return `<p><strong>Envío a:</strong><br>${escapeHtml(a.recipient)}<br>${escapeHtml(a.street)} ${escapeHtml(a.number)}${a.apartment ? ` ${escapeHtml(a.apartment)}` : ""}<br>${escapeHtml(a.city)}, ${escapeHtml(a.province)} (${escapeHtml(a.postal_code)})</p>`;
}

export function bankBlock(s: StoreSettings, total: number): string {
  return `<div style="background:#f7f7f7;padding:16px;margin:16px 0">
<p style="margin:0 0 8px"><strong>Datos para transferir ${formatMoney(total)}</strong></p>
${s.bank_holder ? `<p style="margin:2px 0">Titular: ${escapeHtml(s.bank_holder)}</p>` : ""}
${s.bank_name ? `<p style="margin:2px 0">Banco: ${escapeHtml(s.bank_name)}</p>` : ""}
${s.bank_cbu ? `<p style="margin:2px 0">CBU/CVU: ${escapeHtml(s.bank_cbu)}</p>` : ""}
${s.bank_alias ? `<p style="margin:2px 0">Alias: ${escapeHtml(s.bank_alias)}</p>` : ""}
${s.bank_cuit ? `<p style="margin:2px 0">CUIT: ${escapeHtml(s.bank_cuit)}</p>` : ""}
${s.transfer_instructions ? `<p style="margin:8px 0 0">${escapeHtml(s.transfer_instructions)}</p>` : ""}
</div>`;
}

function adminEnabled(s: StoreSettings): s is StoreSettings & { admin_email: string } {
  return s.notify_email && !!s.admin_email;
}

/** Pedido nuevo: aviso al admin y confirmación al cliente. */
export async function notifyNewOrder(orderId: string) {
  const [s, { order, items }] = await Promise.all([getSettings(), loadOrder(orderId)]);
  const adminUrl = `${siteUrl()}/admin/pedidos/${order.id}`;

  if (adminEnabled(s)) {
    const wa = s.notify_whatsapp
      ? whatsappLink(order.phone, `Hola ${order.customer_name}! Te escribimos de ${s.store_name} por tu pedido #${order.number}.`)
      : null;
    await sendEmail({
      to: s.admin_email,
      subject: `Nuevo pedido #${order.number} - ${formatMoney(order.total)} (${PAYMENT_METHOD_LABEL[order.payment_method]})`,
      replyTo: order.email,
      html: emailLayout(
        s.store_name,
        `Nuevo pedido #${order.number}`,
        `<p>${escapeHtml(order.customer_name)} (${escapeHtml(order.email)}${order.phone ? `, ${escapeHtml(order.phone)}` : ""})</p>
<p>Pago: <strong>${PAYMENT_METHOD_LABEL[order.payment_method]}</strong> — Estado: ${ORDER_STATUS_LABEL[order.status]}</p>
${itemsTable(order, items)}${addressBlock(order)}
${order.notes ? `<p><strong>Notas:</strong> ${escapeHtml(order.notes)}</p>` : ""}
${emailButton(adminUrl, "Ver pedido en el admin")}
${wa ? `<p><a href="${wa}">Escribirle por WhatsApp</a></p>` : ""}`,
      ),
    });
  }

  const isTransfer = order.payment_method === "transfer";
  await sendEmail({
    to: order.email,
    subject: `Recibimos tu pedido #${order.number}`,
    replyTo: s.contact_email ?? undefined,
    html: emailLayout(
      s.store_name,
      `¡Gracias por tu compra, ${order.customer_name.split(" ")[0]}!`,
      `<p>Tu número de pedido es <strong>#${order.number}</strong>.</p>
${isTransfer ? `<p>Para confirmar tu pedido, realizá la transferencia y subí el comprobante desde el link de abajo.</p>${bankBlock(s, Number(order.total))}` : `<p>Te avisamos apenas se acredite el pago.</p>`}
${itemsTable(order, items)}${addressBlock(order)}
${emailButton(orderPublicUrl(order), isTransfer ? "Subir comprobante / ver pedido" : "Ver mi pedido")}`,
    ),
  });
}

const STATUS_MESSAGE: Partial<Record<OrderStatus, string>> = {
  paid: "¡Recibimos tu pago! Ya estamos preparando tu pedido.",
  preparing: "Tu pedido está en preparación.",
  shipped: "¡Tu pedido está en camino!",
  delivered: "Tu pedido fue entregado. ¡Esperamos que lo disfrutes!",
  cancelled: "Tu pedido fue cancelado. Si tenés dudas, respondé este email.",
  rejected: "El pago de tu pedido fue rechazado. Podés intentar nuevamente desde el link de abajo.",
};

/** Cambio de estado: aviso al cliente. */
export async function notifyOrderStatus(orderId: string, note?: string | null) {
  const [s, { order, items }] = await Promise.all([getSettings(), loadOrder(orderId)]);
  const msg = STATUS_MESSAGE[order.status];
  if (!msg) return;
  await sendEmail({
    to: order.email,
    subject: `Pedido #${order.number}: ${ORDER_STATUS_LABEL[order.status]}`,
    replyTo: s.contact_email ?? undefined,
    html: emailLayout(
      s.store_name,
      ORDER_STATUS_LABEL[order.status],
      `<p>${msg}</p>
${order.status === "shipped" && order.tracking_code ? `<p>Código de seguimiento: <strong>${escapeHtml(order.tracking_code)}</strong></p>` : ""}
${note ? `<p>${escapeHtml(note)}</p>` : ""}
${itemsTable(order, items)}
${emailButton(orderPublicUrl(order), "Ver mi pedido")}`,
    ),
  });
}

/** Comprobante de transferencia subido: aviso al admin. */
export async function notifyReceiptUploaded(orderId: string) {
  const [s, { order }] = await Promise.all([getSettings(), loadOrder(orderId)]);
  if (!adminEnabled(s)) return;
  await sendEmail({
    to: s.admin_email,
    subject: `Comprobante recibido - pedido #${order.number}`,
    html: emailLayout(
      s.store_name,
      `Comprobante del pedido #${order.number}`,
      `<p>${escapeHtml(order.customer_name)} subió el comprobante de transferencia por ${formatMoney(order.total)}.</p>
${emailButton(`${siteUrl()}/admin/pedidos/${order.id}`, "Revisar y confirmar pago")}`,
    ),
  });
}

/** Pago de transferencia rechazado: aviso al cliente para que reintente. */
export async function notifyReceiptRejected(orderId: string, reason: string | null) {
  const [s, { order }] = await Promise.all([getSettings(), loadOrder(orderId)]);
  await sendEmail({
    to: order.email,
    subject: `Revisamos tu comprobante - pedido #${order.number}`,
    replyTo: s.contact_email ?? undefined,
    html: emailLayout(
      s.store_name,
      "No pudimos confirmar tu transferencia",
      `<p>Revisamos el comprobante de tu pedido #${order.number} y no pudimos validarlo.</p>
${reason ? `<p><strong>Motivo:</strong> ${escapeHtml(reason)}</p>` : ""}
<p>Podés subir un nuevo comprobante desde el link de abajo.</p>
${bankBlock(s, Number(order.total))}
${emailButton(orderPublicUrl(order), "Subir nuevo comprobante")}`,
    ),
  });
}

/**
 * Alerta de stock bajo para las variantes indicadas (una sola vez por variante
 * hasta que se reponga el stock).
 */
export async function notifyLowStock(variantIds: string[]) {
  if (!variantIds.length) return;
  const s = await getSettings();
  const db = createAdminClient();
  const { data } = await db
    .from("product_variants")
    .select("id, title, sku, stock, products(name)")
    .in("id", variantIds)
    .lte("stock", s.low_stock_threshold)
    .is("low_stock_notified_at", null);
  const low = (data ?? []) as unknown as { id: string; title: string; sku: string | null; stock: number; products: { name: string } | null }[];
  if (!low.length) return;

  await db.from("product_variants").update({ low_stock_notified_at: new Date().toISOString() }).in("id", low.map((v) => v.id));
  if (!adminEnabled(s)) return;

  const rows = low
    .map((v) => `<li>${escapeHtml(v.products?.name)}${v.title ? ` (${escapeHtml(v.title)})` : ""}${v.sku ? ` [${escapeHtml(v.sku)}]` : ""}: <strong>${v.stock}</strong></li>`)
    .join("");
  await sendEmail({
    to: s.admin_email,
    subject: `Stock bajo: ${low.length} variante(s)`,
    html: emailLayout(
      s.store_name,
      "Alerta de stock bajo",
      `<p>Estas variantes quedaron con stock igual o menor a ${s.low_stock_threshold}:</p><ul>${rows}</ul>
${emailButton(`${siteUrl()}/admin/productos?stock=low`, "Ver productos")}`,
    ),
  });
}

/** Variantes de un pedido (para disparar alertas de stock luego de una venta). */
export async function orderVariantIds(orderId: string): Promise<string[]> {
  const { data } = await createAdminClient().from("order_items").select("variant_id").eq("order_id", orderId);
  return (data ?? []).map((r) => r.variant_id).filter(Boolean) as string[];
}

/** Reporte semanal de ventas al admin. */
export async function sendWeeklyReport(now = new Date()) {
  const s = await getSettings();
  if (!adminEnabled(s)) return { sent: false, reason: "Notificaciones por email desactivadas o sin email de admin" };
  const db = createAdminClient();
  const to = now;
  const from = new Date(to.getTime() - 7 * 86_400_000);
  const prevFrom = new Date(from.getTime() - 7 * 86_400_000);

  const [cur, prev, top, visits, pending, lowStock] = await Promise.all([
    db.rpc("report_sales_totals", { p_from: from.toISOString(), p_to: to.toISOString() }).single(),
    db.rpc("report_sales_totals", { p_from: prevFrom.toISOString(), p_to: from.toISOString() }).single(),
    db.rpc("report_top_products", { p_from: from.toISOString(), p_to: to.toISOString(), p_limit: 5 }),
    db.rpc("report_visits_totals", { p_from: from.toISOString(), p_to: to.toISOString() }).single(),
    db.from("orders").select("id", { count: "exact", head: true }).in("status", ["pending_payment", "pending_transfer"]),
    db.from("product_variants").select("id", { count: "exact", head: true }).eq("active", true).lte("stock", s.low_stock_threshold),
  ]);
  type Totals = { orders: number; units: number; billed: number; avg_ticket: number };
  const c = (cur.data ?? { orders: 0, units: 0, billed: 0, avg_ticket: 0 }) as Totals;
  const p = (prev.data ?? { orders: 0, units: 0, billed: 0, avg_ticket: 0 }) as Totals;
  const v = (visits.data ?? { views: 0, visitors: 0, conversion: 0 }) as { views: number; visitors: number; conversion: number };
  const diff = (a: number, b: number) => (b ? `${(((a - b) / b) * 100).toFixed(1)}%` : "—");
  const topRows = ((top.data ?? []) as { product_name: string; units: number; revenue: number }[])
    .map((t) => `<li>${escapeHtml(t.product_name)}: ${t.units} u. (${formatMoney(t.revenue)})</li>`)
    .join("");

  await sendEmail({
    to: s.admin_email,
    subject: `Reporte semanal ${formatDate(from)} - ${formatDate(to)}: ${formatMoney(c.billed)}`,
    html: emailLayout(
      s.store_name,
      "Reporte semanal de ventas",
      `<p>Del ${formatDate(from)} al ${formatDate(to)}</p>
<table width="100%" style="font-size:14px">
<tr><td>Facturación</td><td align="right"><strong>${formatMoney(c.billed)}</strong></td><td align="right">${diff(Number(c.billed), Number(p.billed))} vs semana anterior</td></tr>
<tr><td>Pedidos pagados</td><td align="right"><strong>${c.orders}</strong></td><td align="right">${diff(Number(c.orders), Number(p.orders))}</td></tr>
<tr><td>Unidades</td><td align="right">${c.units}</td><td></td></tr>
<tr><td>Ticket promedio</td><td align="right">${formatMoney(c.avg_ticket)}</td><td></td></tr>
<tr><td>Visitas / visitantes</td><td align="right">${v.views} / ${v.visitors}</td><td align="right">Conversión ${v.conversion}%</td></tr>
</table>
${topRows ? `<h3>Más vendidos</h3><ul>${topRows}</ul>` : ""}
<p>Pedidos pendientes de pago: <strong>${pending.count ?? 0}</strong><br>Variantes con stock bajo: <strong>${lowStock.count ?? 0}</strong></p>
${emailButton(`${siteUrl()}/admin/reportes`, "Ver reportes")}`,
    ),
  });
  return { sent: true };
}
