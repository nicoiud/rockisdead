import type { NextRequest } from "next/server";
import { assertStaff } from "@/lib/auth";
import { listOrders, orderFiltersFromParams, type OrderListRow } from "@/lib/admin-orders";
import { fileResponse } from "@/lib/spreadsheet";
import { formatDate } from "@/lib/format";
import { ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/labels";
import { ymdAR } from "@/lib/dates";
import type { OrderItem } from "@/lib/types";

export async function GET(request: NextRequest) {
  try {
    await assertStaff("orders");
  } catch {
    return new Response("No autorizado", { status: 403 });
  }
  const sp = Object.fromEntries(request.nextUrl.searchParams);
  const format = sp.formato === "xlsx" ? "xlsx" : "csv";
  const filters = orderFiltersFromParams(sp);

  const all: (OrderListRow & { order_items: OrderItem[] })[] = [];
  for (let page = 1; page <= 50; page++) {
    const { orders, total } = await listOrders(filters, page, 1000, "*, payments(status, receipt_path), order_items(*)");
    all.push(...(orders as (OrderListRow & { order_items: OrderItem[] })[]));
    if (all.length >= total || !orders.length) break;
  }

  const columns = [
    "pedido", "fecha", "estado", "metodo_pago", "cliente", "email", "telefono", "documento", "productos", "unidades",
    "subtotal", "descuento", "envio", "total", "metodo_envio", "direccion", "localidad", "provincia", "cp", "seguimiento", "notas", "fecha_pago",
  ];
  const rows = all.map((o) => {
    const a = o.shipping_address;
    return {
      pedido: o.number,
      fecha: formatDate(o.created_at, true),
      estado: ORDER_STATUS_LABEL[o.status],
      metodo_pago: PAYMENT_METHOD_LABEL[o.payment_method],
      cliente: o.customer_name,
      email: o.email,
      telefono: o.phone,
      documento: o.document,
      productos: o.order_items.map((i) => `${i.quantity}x ${i.product_name}${i.variant_title ? ` (${i.variant_title})` : ""}`).join("; "),
      unidades: o.order_items.reduce((n, i) => n + i.quantity, 0),
      subtotal: Number(o.subtotal),
      descuento: Number(o.discount),
      envio: Number(o.shipping_cost),
      total: Number(o.total),
      metodo_envio: o.shipping_method_name,
      direccion: a ? `${a.street} ${a.number}${a.apartment ? ` ${a.apartment}` : ""}` : "",
      localidad: a?.city ?? "",
      provincia: a?.province ?? "",
      cp: a?.postal_code ?? "",
      seguimiento: o.tracking_code,
      notas: o.notes,
      fecha_pago: o.paid_at ? formatDate(o.paid_at, true) : "",
    };
  });
  return fileResponse(format, `pedidos-${ymdAR()}`, columns, rows);
}
