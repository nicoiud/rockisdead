import "server-only";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { mergeGuestCart } from "@/lib/cart";

/** Tras iniciar sesión: vincula pedidos hechos como invitado (email verificado) y fusiona el carrito. */
export async function afterSignIn(user: User) {
  if (user.email && user.email_confirmed_at) {
    await createAdminClient().from("orders").update({ user_id: user.id }).is("user_id", null).eq("email", user.email.toLowerCase());
  }
  await mergeGuestCart(user.id);
}
