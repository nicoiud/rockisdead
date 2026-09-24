import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/settings";
import { createPreference } from "@/lib/mercadopago";
import type { Order, OrderItem } from "@/lib/types";

/** Crea la preferencia de MP y devuelve la URL de pago (o null si falla). */
export async function startMercadoPago(orderId: string): Promise<string | null> {
  const db = createAdminClient();
  const { data: order } = await db.from("orders").select("*").eq("id", orderId).single<Order>();
  const { data: items } = await db.from("order_items").select("*").eq("order_id", orderId);
  if (!order) return null;
  try {
    const settings = await getSettings();
    const pref = await createPreference(order, (items ?? []) as OrderItem[], settings.store_name);
    await db
      .from("payments")
      .update({ mp_preference_id: pref.id })
      .eq("order_id", orderId)
      .eq("method", "mercado_pago")
      .is("mp_payment_id", null);
    const useSandbox = process.env.MP_SANDBOX === "true";
    return useSandbox ? pref.sandbox_init_point : pref.init_point;
  } catch (e) {
    console.error("[mercadopago] createPreference", e);
    return null;
  }
}
