"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ORDER_STATUSES } from "@/lib/labels";
import { notifyLowStock, notifyOrderStatus, notifyReceiptRejected, orderVariantIds } from "@/lib/notifications";
import type { ActionState, OrderStatus } from "@/lib/types";

async function guard() {
  try {
    return { profile: await assertStaff("orders") };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

const statusSchema = z.object({
  order_id: z.uuid(),
  status: z.enum(ORDER_STATUSES as [OrderStatus, ...OrderStatus[]]),
  note: z.string().trim().max(500).optional(),
  tracking_code: z.string().trim().max(120).optional(),
  notify: z.string().optional(),
});

export async function changeOrderStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await guard();
  if (!g.profile) return { error: g.error };
  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { order_id, status, note, tracking_code, notify } = parsed.data;
  const db = createAdminClient();

  if (tracking_code !== undefined) {
    await db.from("orders").update({ tracking_code: tracking_code || null }).eq("id", order_id);
  }
  const { data: old, error } = await db.rpc("set_order_status", {
    p_order: order_id,
    p_status: status,
    p_note: note || null,
    p_actor: g.profile.id,
  });
  if (error) return { error: error.message };
  if (old === null) {
    revalidatePath(`/admin/pedidos/${order_id}`);
    return { ok: true, message: tracking_code !== undefined ? "Datos guardados" : "El pedido ya tenía ese estado" };
  }
  // Si pasó a pagado, el pago pendiente queda aprobado
  if (["paid", "preparing", "shipped", "delivered"].includes(status)) {
    await db
      .from("payments")
      .update({ status: "approved", reviewed_by: g.profile.id, reviewed_at: new Date().toISOString() })
      .eq("order_id", order_id)
      .in("status", ["pending", "in_review"]);
  }
  after(async () => {
    if (notify === "1") await notifyOrderStatus(order_id, note).catch((e) => console.error(e));
    await notifyLowStock(await orderVariantIds(order_id)).catch((e) => console.error(e));
  });
  revalidatePath(`/admin/pedidos/${order_id}`);
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Estado actualizado" };
}

export async function approveTransfer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await guard();
  if (!g.profile) return { error: g.error };
  const orderId = z.uuid().parse(formData.get("order_id"));
  const db = createAdminClient();
  const { data: changed, error } = await db.rpc("mark_order_paid", {
    p_order: orderId,
    p_note: "Transferencia confirmada",
    p_actor: g.profile.id,
  });
  if (error) return { error: error.message };
  await db
    .from("payments")
    .update({ status: "approved", reviewed_by: g.profile.id, reviewed_at: new Date().toISOString(), review_note: null })
    .eq("order_id", orderId)
    .eq("method", "transfer")
    .in("status", ["pending", "in_review", "rejected"]);
  if (changed) {
    after(async () => {
      await notifyOrderStatus(orderId).catch((e) => console.error(e));
      await notifyLowStock(await orderVariantIds(orderId)).catch((e) => console.error(e));
    });
  }
  revalidatePath(`/admin/pedidos/${orderId}`);
  revalidatePath("/admin", "layout");
  return { ok: true, message: changed ? "Pago confirmado. Se descontó el stock y se avisó al cliente." : "El pedido ya estaba pagado" };
}

export async function rejectTransfer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await guard();
  if (!g.profile) return { error: g.error };
  const orderId = z.uuid().parse(formData.get("order_id"));
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300) || null;
  const cancel = formData.get("cancel") === "1";
  const db = createAdminClient();
  await db
    .from("payments")
    .update({ status: "rejected", review_note: reason, reviewed_by: g.profile.id, reviewed_at: new Date().toISOString() })
    .eq("order_id", orderId)
    .eq("method", "transfer")
    .in("status", ["pending", "in_review"]);
  if (cancel) {
    await db.rpc("set_order_status", { p_order: orderId, p_status: "cancelled", p_note: `Transferencia rechazada${reason ? `: ${reason}` : ""}`, p_actor: g.profile.id });
    after(() => notifyOrderStatus(orderId, reason).catch((e) => console.error(e)));
  } else {
    await db.from("order_status_history").insert({
      order_id: orderId,
      status: "pending_transfer",
      note: `Comprobante rechazado${reason ? `: ${reason}` : ""}`,
      created_by: g.profile.id,
    });
    after(() => notifyReceiptRejected(orderId, reason).catch((e) => console.error(e)));
  }
  revalidatePath(`/admin/pedidos/${orderId}`);
  return { ok: true, message: cancel ? "Pedido cancelado" : "Comprobante rechazado. Se le pidió al cliente uno nuevo." };
}

export async function addOrderNote(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await guard();
  if (!g.profile) return { error: g.error };
  const orderId = z.uuid().parse(formData.get("order_id"));
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000);
  if (!note) return { error: "Escribí una nota" };
  const db = createAdminClient();
  const { data: order } = await db.from("orders").select("status").eq("id", orderId).single();
  await db.from("order_status_history").insert({ order_id: orderId, status: order!.status, note, created_by: g.profile.id });
  revalidatePath(`/admin/pedidos/${orderId}`);
  return { ok: true, message: "Nota agregada" };
}
