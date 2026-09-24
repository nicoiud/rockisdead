"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyLowStock } from "@/lib/notifications";
import type { ActionState } from "@/lib/types";

const schema = z.object({
  variant_id: z.uuid({ error: "Elegí una variante" }),
  mode: z.enum(["add", "set"]),
  value: z.coerce.number().int("Debe ser un número entero"),
  note: z.string().trim().max(300).optional(),
});

export async function adjustStockAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let actor: string;
  try {
    actor = (await assertStaff("products")).id;
  } catch (e) {
    return { error: (e as Error).message };
  }
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { variant_id, mode, value, note } = parsed.data;
  const db = createAdminClient();
  const { data, error } =
    mode === "set"
      ? await db.rpc("set_stock", { p_variant: variant_id, p_stock: value, p_reason: "manual", p_note: note || null, p_actor: actor })
      : await db.rpc("adjust_stock", { p_variant: variant_id, p_delta: value, p_reason: "manual", p_note: note || null, p_actor: actor });
  if (error) return { error: error.message };
  await notifyLowStock([variant_id]);
  revalidatePath("/admin/stock");
  return { ok: true, message: `Stock actualizado: ${data}` };
}
