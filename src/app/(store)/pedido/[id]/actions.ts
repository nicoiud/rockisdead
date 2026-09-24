"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyReceiptUploaded } from "@/lib/notifications";
import type { ActionState, Order } from "@/lib/types";
import { canAccessOrder } from "./access";
import { startMercadoPago } from "@/lib/checkout";

const MAX_SIZE = 4 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export async function uploadReceipt(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const orderId = String(formData.get("order_id") ?? "");
  const token = String(formData.get("token") ?? "");
  const file = formData.get("receipt");

  const db = createAdminClient();
  const { data: order } = await db.from("orders").select("*").eq("id", orderId).maybeSingle<Order>();
  if (!order || !(await canAccessOrder(order, token))) return { error: "Pedido no encontrado" };
  if (order.payment_method !== "transfer" || !["pending_transfer", "rejected"].includes(order.status)) {
    return { error: "Este pedido no admite comprobantes" };
  }
  if (!(file instanceof File) || file.size === 0) return { error: "Elegí un archivo" };
  if (file.size > MAX_SIZE) return { error: "El archivo supera los 4 MB" };
  const ext = TYPES[file.type];
  if (!ext) return { error: "Formato no permitido (JPG, PNG, WEBP o PDF)" };

  const path = `${order.id}/${Date.now()}.${ext}`;
  const { error: upErr } = await db.storage.from("receipts").upload(path, file, { contentType: file.type });
  if (upErr) return { error: "No pudimos subir el archivo. Intentá de nuevo." };

  const { data: payment } = await db
    .from("payments")
    .select("id")
    .eq("order_id", order.id)
    .eq("method", "transfer")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const patch = { receipt_path: path, receipt_uploaded_at: new Date().toISOString(), status: "in_review" as const, review_note: null };
  if (payment) await db.from("payments").update(patch).eq("id", payment.id);
  else await db.from("payments").insert({ ...patch, order_id: order.id, method: "transfer", amount: order.total });

  if (order.status === "rejected") {
    await db.rpc("set_order_status", { p_order: order.id, p_status: "pending_transfer", p_note: "Nuevo comprobante subido" });
  } else {
    await db.from("order_status_history").insert({ order_id: order.id, status: order.status, note: "Comprobante subido por el cliente" });
  }

  after(() => notifyReceiptUploaded(order.id).catch((e) => console.error("notifyReceiptUploaded", e)));
  revalidatePath(`/pedido/${order.id}`);
  return { ok: true, message: "¡Recibimos tu comprobante! Te avisamos por email cuando confirmemos el pago." };
}

export async function retryMercadoPago(formData: FormData) {
  const orderId = String(formData.get("order_id") ?? "");
  const token = String(formData.get("token") ?? "");
  const { data: order } = await createAdminClient().from("orders").select("*").eq("id", orderId).maybeSingle<Order>();
  if (!order || !(await canAccessOrder(order, token))) redirect("/");
  if (order.payment_method !== "mercado_pago" || !["pending_payment", "rejected"].includes(order.status)) {
    redirect(`/pedido/${order.id}?t=${order.access_token}`);
  }
  const url = await startMercadoPago(order.id);
  redirect(url ?? `/pedido/${order.id}?t=${order.access_token}&mp_error=1`);
}
