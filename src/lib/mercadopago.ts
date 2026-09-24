import "server-only";
import { siteUrl } from "@/lib/env";
import { getPrivateSettings } from "@/lib/settings";
import type { Order, OrderItem } from "@/lib/types";

// MP_API_URL solo se usa para pruebas con un servidor simulado
const API = process.env.MP_API_URL ?? "https://api.mercadopago.com";

async function token(): Promise<string> {
  const { mp_access_token } = await getPrivateSettings();
  if (!mp_access_token) throw new Error("Mercado Pago no está configurado (falta el Access Token)");
  return mp_access_token;
}

async function mpFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await token()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mercado Pago ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export interface MpPreference {
  id: string;
  init_point: string;
  sandbox_init_point: string;
}

/** Crea una preferencia de Checkout Pro para un pedido. */
export async function createPreference(order: Order, items: OrderItem[], storeName: string): Promise<MpPreference> {
  const site = siteUrl();
  const back = `${site}/pedido/${order.id}?t=${order.access_token}`;

  const mpItems = items.map((it) => ({
    id: it.sku ?? it.variant_id ?? it.id,
    title: it.variant_title ? `${it.product_name} (${it.variant_title})` : it.product_name,
    quantity: it.quantity,
    unit_price: Number(it.unit_price),
    currency_id: "ARS",
    picture_url: it.image_url ?? undefined,
  }));
  if (Number(order.shipping_cost) > 0) {
    mpItems.push({
      id: "envio",
      title: `Envío: ${order.shipping_method_name ?? ""}`.trim(),
      quantity: 1,
      unit_price: Number(order.shipping_cost),
      currency_id: "ARS",
      picture_url: undefined,
    });
  }
  // Si hubiera descuento, se cobra el total en una sola línea para que coincida exacto
  const itemsTotal = mpItems.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const finalItems =
    Math.abs(itemsTotal - Number(order.total)) > 0.009
      ? [{ id: String(order.number), title: `${storeName} - Pedido #${order.number}`, quantity: 1, unit_price: Number(order.total), currency_id: "ARS", picture_url: undefined }]
      : mpItems;

  const isLocal = /localhost|127\.0\.0\.1/.test(site);
  return mpFetch<MpPreference>("/checkout/preferences", {
    method: "POST",
    headers: { "X-Idempotency-Key": `${order.id}-${Date.now()}` },
    body: JSON.stringify({
      items: finalItems,
      payer: { email: order.email, name: order.customer_name },
      external_reference: order.id,
      metadata: { order_id: order.id, order_number: order.number },
      statement_descriptor: storeName.slice(0, 22),
      back_urls: { success: back, failure: back, pending: back },
      // MP no acepta auto_return ni webhooks con localhost
      ...(isLocal ? {} : { auto_return: "approved", notification_url: `${site}/api/webhooks/mercadopago` }),
    }),
  });
}

export interface MpPayment {
  id: number;
  status: "pending" | "approved" | "authorized" | "in_process" | "in_mediation" | "rejected" | "cancelled" | "refunded" | "charged_back";
  status_detail: string;
  external_reference: string | null;
  transaction_amount: number;
  date_approved: string | null;
  payment_method_id: string;
  payment_type_id: string;
}

export function getPayment(id: string): Promise<MpPayment> {
  return mpFetch<MpPayment>(`/v1/payments/${encodeURIComponent(id)}`);
}

export { verifyWebhookSignature } from "./mp-signature";
