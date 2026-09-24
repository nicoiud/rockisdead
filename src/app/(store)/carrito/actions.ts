"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCartId } from "@/lib/cart";
import type { ActionState } from "@/lib/types";

const addSchema = z.object({
  variant_id: z.uuid({ error: "Elegí una variante" }),
  quantity: z.coerce.number().int().min(1).max(99),
});

async function availableStock(variantId: string): Promise<number | null> {
  const { data } = await createAdminClient()
    .from("product_variants")
    .select("stock, active, products(status)")
    .eq("id", variantId)
    .maybeSingle();
  const row = data as unknown as { stock: number; active: boolean; products: { status: string } | null } | null;
  if (!row || !row.active || row.products?.status !== "active") return null;
  return row.stock;
}

export async function addToCart(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = addSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { variant_id, quantity } = parsed.data;

  const stock = await availableStock(variant_id);
  if (stock === null) return { error: "Este producto no está disponible" };

  const cartId = await getCartId(true);
  const db = createAdminClient();
  const { data: existing } = await db
    .from("cart_items")
    .select("quantity")
    .eq("cart_id", cartId!)
    .eq("variant_id", variant_id)
    .maybeSingle();
  const newQty = (existing?.quantity ?? 0) + quantity;
  if (newQty > stock) {
    return { error: stock > 0 ? `Solo hay ${stock} unidades disponibles${existing ? ` (ya tenés ${existing.quantity} en el carrito)` : ""}` : "Sin stock" };
  }
  await db.from("cart_items").upsert({ cart_id: cartId!, variant_id, quantity: newQty }, { onConflict: "cart_id,variant_id" });
  await db.from("carts").update({ updated_at: new Date().toISOString() }).eq("id", cartId!);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateCartItem(formData: FormData) {
  const itemId = z.uuid().parse(formData.get("item_id"));
  const quantity = z.coerce.number().int().min(0).max(99).parse(formData.get("quantity"));
  const cartId = await getCartId(false);
  if (!cartId) return;
  const db = createAdminClient();
  if (quantity === 0) {
    await db.from("cart_items").delete().eq("id", itemId).eq("cart_id", cartId);
  } else {
    await db.from("cart_items").update({ quantity }).eq("id", itemId).eq("cart_id", cartId);
  }
  revalidatePath("/", "layout");
}

export async function removeCartItem(formData: FormData) {
  const itemId = z.uuid().parse(formData.get("item_id"));
  const cartId = await getCartId(false);
  if (!cartId) return;
  await createAdminClient().from("cart_items").delete().eq("id", itemId).eq("cart_id", cartId);
  revalidatePath("/", "layout");
}
