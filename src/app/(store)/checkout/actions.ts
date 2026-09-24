"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth";
import { clearCart, getCart } from "@/lib/cart";
import { startMercadoPago } from "@/lib/checkout";
import { notifyNewOrder } from "@/lib/notifications";
import type { ActionState } from "@/lib/types";

const addressSchema = z.object({
  recipient: z.string().trim().min(2, "Ingresá quién recibe"),
  phone: z.string().trim().nullish(),
  street: z.string().trim().min(2, "Ingresá la calle"),
  number: z.string().trim().min(1, "Ingresá la altura"),
  apartment: z.string().trim().nullish(),
  city: z.string().trim().min(2, "Ingresá la localidad"),
  province: z.string().trim().min(2, "Ingresá la provincia"),
  postal_code: z.string().trim().min(3, "Ingresá el código postal"),
  notes: z.string().trim().nullish(),
});

const checkoutSchema = z.object({
  email: z.email({ error: "Email inválido" }).trim(),
  customer_name: z.string().trim().min(3, "Ingresá tu nombre y apellido"),
  phone: z.string().trim().min(6, "Ingresá un teléfono"),
  document: z.string().trim().optional(),
  shipping_method_id: z.uuid({ error: "Elegí un método de envío" }),
  payment_method: z.enum(["mercado_pago", "transfer"], { error: "Elegí un método de pago" }),
  notes: z.string().trim().max(1000).optional(),
  save_address: z.string().optional(),
});

const ERRORS: Record<string, string> = {
  EMPTY_CART: "Tu carrito está vacío",
  INVALID_SHIPPING_METHOD: "El método de envío no es válido",
  ADDRESS_REQUIRED: "Completá la dirección de envío",
  PAYMENT_METHOD_DISABLED: "Ese método de pago no está disponible",
  INVALID_QUANTITY: "Cantidad inválida",
};

function friendlyError(message: string): string {
  const [code, detail] = message.split(/:(.*)/s);
  if (code === "OUT_OF_STOCK") return `No hay stock suficiente de ${detail}. Actualizá tu carrito.`;
  if (code === "PRODUCT_UNAVAILABLE") return `${detail} ya no está disponible. Quitalo del carrito para continuar.`;
  return ERRORS[code] ?? "No pudimos crear tu pedido. Intentá nuevamente.";
}

export async function placeOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = checkoutSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const input = parsed.data;

  const db = createAdminClient();
  const profile = await getProfile();
  if (profile && !profile.active) return { error: "Tu cuenta está deshabilitada" };

  const { data: method } = await db.from("shipping_methods").select("requires_address").eq("id", input.shipping_method_id).maybeSingle();
  if (!method) return { error: ERRORS.INVALID_SHIPPING_METHOD };

  let address: z.infer<typeof addressSchema> | null = null;
  if (method.requires_address) {
    // Dirección guardada o nueva
    if (raw.address_id && profile) {
      const { data: saved } = await db.from("addresses").select("*").eq("id", raw.address_id).eq("user_id", profile.id).maybeSingle();
      if (!saved) return { error: "Dirección inválida" };
      address = addressSchema.parse(saved);
    } else {
      const a = addressSchema.safeParse({
        recipient: raw.recipient || input.customer_name,
        phone: raw.address_phone || input.phone,
        street: raw.street,
        number: raw.number,
        apartment: raw.apartment,
        city: raw.city,
        province: raw.province,
        postal_code: raw.postal_code,
        notes: raw.address_notes,
      });
      if (!a.success) return { error: a.error.issues[0].message };
      address = a.data;
    }
  }

  const cart = await getCart();
  if (!cart.id || !cart.lines.length) return { error: ERRORS.EMPTY_CART };
  if (cart.hasIssues) return { error: "Hay productos sin stock o no disponibles en tu carrito." };

  const { data: created, error } = await db
    .rpc("create_order", {
      p: {
        user_id: profile?.id ?? null,
        email: profile?.email ?? input.email,
        customer_name: input.customer_name,
        phone: input.phone,
        document: input.document,
        notes: input.notes,
        payment_method: input.payment_method,
        shipping_method_id: input.shipping_method_id,
        shipping_address: address,
        items: cart.lines.map((l) => ({ variant_id: l.variant_id, quantity: l.quantity })),
      },
    })
    .single<{ order_id: string; order_number: number; order_token: string; order_total: number }>();
  if (error || !created) return { error: friendlyError(error?.message ?? "") };

  await clearCart(cart.id);

  if (profile) {
    // Completa datos del perfil si faltaban
    const patch: Record<string, string> = {};
    if (!profile.full_name) patch.full_name = input.customer_name;
    if (!profile.phone) patch.phone = input.phone;
    if (!profile.document && input.document) patch.document = input.document;
    if (Object.keys(patch).length) await db.from("profiles").update(patch).eq("id", profile.id);
    if (address && input.save_address && !raw.address_id) {
      const { count } = await db.from("addresses").select("id", { count: "exact", head: true }).eq("user_id", profile.id);
      await db.from("addresses").insert({ ...address, user_id: profile.id, is_default: !count });
    }
  }

  after(() => notifyNewOrder(created.order_id).catch((e) => console.error("notifyNewOrder", e)));
  revalidatePath("/", "layout");

  const orderUrl = `/pedido/${created.order_id}?t=${created.order_token}`;
  if (input.payment_method === "mercado_pago") {
    const initPoint = await startMercadoPago(created.order_id);
    if (initPoint) redirect(initPoint);
    redirect(`${orderUrl}&mp_error=1`);
  }
  redirect(orderUrl);
}
