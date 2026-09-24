import "server-only";
import { timingSafeEqual } from "node:crypto";
import { getProfile, hasPermission } from "@/lib/auth";
import type { Order } from "@/lib/types";

/** Acceso a un pedido: token del link, dueño logueado o staff con permiso de pedidos. */
export async function canAccessOrder(order: Pick<Order, "access_token" | "user_id">, token: string | null | undefined) {
  if (token && token.length === order.access_token.length) {
    if (timingSafeEqual(Buffer.from(token), Buffer.from(order.access_token))) return true;
  }
  const profile = await getProfile();
  if (!profile) return false;
  if (order.user_id && order.user_id === profile.id) return true;
  return hasPermission(profile, "orders");
}
