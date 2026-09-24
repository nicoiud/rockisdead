import "server-only";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/auth";

export const CART_COOKIE = "rid_cart";

export interface CartLine {
  id: string;
  variant_id: string;
  quantity: number;
  product_id: string;
  product_name: string;
  product_slug: string;
  variant_title: string;
  sku: string | null;
  unit_price: number;
  compare_at_price: number | null;
  stock: number;
  image_url: string | null;
  available: boolean; // publicado, activo y con stock suficiente
  issue: string | null;
}

export interface Cart {
  id: string | null;
  lines: CartLine[];
  count: number;
  subtotal: number;
  hasIssues: boolean;
}

/** Id del carrito actual. Con `create` crea uno si no existe (solo en actions/route handlers). */
export async function getCartId(create = false): Promise<string | null> {
  const db = createAdminClient();
  const user = await getUser();
  const store = await cookies();
  const cookieId = store.get(CART_COOKIE)?.value ?? null;

  if (user) {
    const { data } = await db.from("carts").select("id").eq("user_id", user.id).maybeSingle();
    if (data) return data.id;
    // Adoptar el carrito de invitado si existe
    if (cookieId) {
      const { data: guest } = await db.from("carts").select("id, user_id").eq("id", cookieId).maybeSingle();
      if (guest && !guest.user_id) {
        await db.from("carts").update({ user_id: user.id }).eq("id", guest.id);
        return guest.id;
      }
    }
    if (!create) return null;
    const { data: created } = await db.from("carts").insert({ user_id: user.id }).select("id").single();
    return created!.id;
  }

  if (cookieId) {
    const { data } = await db.from("carts").select("id, user_id").eq("id", cookieId).maybeSingle();
    if (data && !data.user_id) return data.id;
  }
  if (!create) return null;
  const { data: created } = await db.from("carts").insert({}).select("id").single();
  store.set(CART_COOKIE, created!.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 60,
    path: "/",
  });
  return created!.id;
}

/** Al iniciar sesión: fusiona el carrito de invitado con el del usuario. */
export async function mergeGuestCart(userId: string) {
  const db = createAdminClient();
  const store = await cookies();
  const guestId = store.get(CART_COOKIE)?.value;
  if (!guestId) return;
  const { data: guest } = await db.from("carts").select("id, user_id").eq("id", guestId).maybeSingle();
  if (!guest || guest.user_id) return;

  const { data: userCart } = await db.from("carts").select("id").eq("user_id", userId).maybeSingle();
  if (!userCart) {
    await db.from("carts").update({ user_id: userId }).eq("id", guest.id);
    return;
  }
  const { data: guestItems } = await db.from("cart_items").select("variant_id, quantity").eq("cart_id", guest.id);
  const { data: userItems } = await db.from("cart_items").select("variant_id, quantity").eq("cart_id", userCart.id);
  for (const gi of guestItems ?? []) {
    const existing = userItems?.find((u) => u.variant_id === gi.variant_id);
    await db
      .from("cart_items")
      .upsert(
        { cart_id: userCart.id, variant_id: gi.variant_id, quantity: (existing?.quantity ?? 0) + gi.quantity },
        { onConflict: "cart_id,variant_id" },
      );
  }
  await db.from("carts").delete().eq("id", guest.id);
  store.delete(CART_COOKIE);
}

type CartRow = {
  id: string;
  variant_id: string;
  quantity: number;
  product_variants: {
    id: string;
    title: string;
    sku: string | null;
    price: number | null;
    compare_at_price: number | null;
    stock: number;
    active: boolean;
    image_id: string | null;
    products: {
      id: string;
      name: string;
      slug: string;
      price: number;
      compare_at_price: number | null;
      status: string;
      product_images: { id: string; url: string; position: number }[];
    };
  } | null;
};

export async function getCart(): Promise<Cart> {
  const id = await getCartId(false);
  if (!id) return { id: null, lines: [], count: 0, subtotal: 0, hasIssues: false };

  const { data } = await createAdminClient()
    .from("cart_items")
    .select(
      "id, variant_id, quantity, product_variants(id, title, sku, price, compare_at_price, stock, active, image_id, products(id, name, slug, price, compare_at_price, status, product_images(id, url, position)))",
    )
    .eq("cart_id", id)
    .order("created_at");

  const lines: CartLine[] = [];
  for (const row of (data ?? []) as unknown as CartRow[]) {
    const v = row.product_variants;
    if (!v) continue;
    const p = v.products;
    const images = [...(p.product_images ?? [])].sort((a, b) => a.position - b.position);
    const image = images.find((i) => i.id === v.image_id) ?? images[0];
    let issue: string | null = null;
    if (p.status !== "active" || !v.active) issue = "Este producto ya no está disponible";
    else if (v.stock <= 0) issue = "Sin stock";
    else if (v.stock < row.quantity) issue = `Solo quedan ${v.stock} unidades`;
    lines.push({
      id: row.id,
      variant_id: row.variant_id,
      quantity: row.quantity,
      product_id: p.id,
      product_name: p.name,
      product_slug: p.slug,
      variant_title: v.title,
      sku: v.sku,
      unit_price: Number(v.price ?? p.price),
      compare_at_price: v.compare_at_price ?? p.compare_at_price,
      stock: v.stock,
      image_url: image?.url ?? null,
      available: !issue,
      issue,
    });
  }
  return {
    id,
    lines,
    count: lines.reduce((n, l) => n + l.quantity, 0),
    subtotal: lines.reduce((s, l) => s + l.unit_price * l.quantity, 0),
    hasIssues: lines.some((l) => !l.available),
  };
}

export async function clearCart(cartId: string) {
  await createAdminClient().from("cart_items").delete().eq("cart_id", cartId);
}
