import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPayment, type MpPayment } from "@/lib/mercadopago";
import { notifyLowStock, notifyOrderStatus, orderVariantIds } from "@/lib/notifications";
import type { Order, PaymentStatus } from "@/lib/types";

const MP_TO_PAYMENT: Record<MpPayment["status"], PaymentStatus> = {
  pending: "pending",
  in_process: "pending",
  in_mediation: "pending",
  authorized: "pending",
  approved: "approved",
  rejected: "rejected",
  cancelled: "cancelled",
  refunded: "refunded",
  charged_back: "refunded",
};

/**
 * Consulta un pago en Mercado Pago y sincroniza pedido + pago + stock.
 * Idempotente: se puede llamar desde el webhook y desde la URL de retorno.
 */
export async function syncMercadoPagoPayment(paymentId: string): Promise<{ orderId: string | null; status: string }> {
  const mp = await getPayment(paymentId);
  const orderId = mp.external_reference;
  if (!orderId) return { orderId: null, status: "sin_referencia" };

  const db = createAdminClient();
  const { data: order } = await db.from("orders").select("*").eq("id", orderId).maybeSingle<Order>();
  if (!order) return { orderId: null, status: "pedido_inexistente" };

  const paymentStatus = MP_TO_PAYMENT[mp.status] ?? "pending";
  const paymentRow = {
    order_id: order.id,
    method: "mercado_pago" as const,
    status: paymentStatus,
    amount: mp.transaction_amount,
    mp_payment_id: String(mp.id),
    mp_status: mp.status,
    mp_status_detail: mp.status_detail,
    raw: mp as unknown as Record<string, unknown>,
  };

  // Reutiliza el registro de pago pendiente creado con el pedido, o crea uno nuevo (reintentos)
  const { data: existing } = await db.from("payments").select("id").eq("mp_payment_id", String(mp.id)).maybeSingle();
  if (existing) {
    await db.from("payments").update(paymentRow).eq("id", existing.id);
  } else {
    const { data: placeholder } = await db
      .from("payments")
      .select("id")
      .eq("order_id", order.id)
      .eq("method", "mercado_pago")
      .is("mp_payment_id", null)
      .limit(1)
      .maybeSingle();
    if (placeholder) await db.from("payments").update(paymentRow).eq("id", placeholder.id);
    else await db.from("payments").insert(paymentRow);
  }

  if (mp.status === "approved") {
    if (mp.transaction_amount + 0.01 < Number(order.total)) {
      await db.from("order_status_history").insert({
        order_id: order.id,
        status: order.status,
        note: `Pago MP ${mp.id} aprobado por ${mp.transaction_amount} pero el total es ${order.total}. Revisar manualmente.`,
      });
      return { orderId: order.id, status: "monto_incorrecto" };
    }
    const { data: changed, error } = await db.rpc("mark_order_paid", {
      p_order: order.id,
      p_note: `Mercado Pago #${mp.id} aprobado`,
    });
    if (error) throw error;
    if (changed) {
      await notifyOrderStatus(order.id);
      await notifyLowStock(await orderVariantIds(order.id));
    }
    return { orderId: order.id, status: "approved" };
  }

  if ((mp.status === "rejected" || mp.status === "cancelled") && order.status === "pending_payment") {
    await db.rpc("set_order_status", { p_order: order.id, p_status: "rejected", p_note: `Mercado Pago: ${mp.status_detail}` });
    await notifyOrderStatus(order.id);
  }

  if ((mp.status === "refunded" || mp.status === "charged_back") && !["cancelled", "rejected"].includes(order.status)) {
    await db.rpc("set_order_status", { p_order: order.id, p_status: "cancelled", p_note: `Mercado Pago: pago ${mp.status}` });
  }

  return { orderId: order.id, status: mp.status };
}
