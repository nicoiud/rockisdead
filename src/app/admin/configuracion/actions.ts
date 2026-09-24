"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWeeklyReport } from "@/lib/notifications";
import type { ActionState } from "@/lib/types";

async function guard(): Promise<string | null> {
  try {
    await assertStaff("settings");
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

const opt = z.string().trim().max(500).optional().transform((v) => v || null);
const bool = z.string().optional().transform((v) => v === "1");

const storeSchema = z.object({
  store_name: z.string().trim().min(1).max(80),
  logo_url: opt,
  contact_email: opt,
  contact_phone: opt,
  whatsapp: z.string().trim().optional().transform((v) => (v ? v.replace(/\D/g, "") : null)),
  instagram: opt,
  address: opt,
});

const paymentsSchema = z.object({
  mp_enabled: bool,
  transfer_enabled: bool,
  mp_public_key: opt,
  bank_name: opt,
  bank_holder: opt,
  bank_cuit: opt,
  bank_cbu: opt,
  bank_alias: opt,
  transfer_instructions: z.string().trim().max(2000).optional().transform((v) => v || null),
  transfer_discount_pct: z.coerce.number().min(0).max(99),
});

const notifySchema = z.object({
  notify_email: bool,
  notify_whatsapp: bool,
  admin_email: z.union([z.email(), z.literal("")]).optional().transform((v) => v || null),
  low_stock_threshold: z.coerce.number().int().min(0).max(1000),
});

async function saveSettings(schema: z.ZodType<Record<string, unknown>>, formData: FormData): Promise<ActionState> {
  const err = await guard();
  if (err) return { error: err };
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { error } = await createAdminClient().from("store_settings").update(parsed.data).eq("id", 1);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, message: "Guardado" };
}

export async function saveStore(_p: ActionState, fd: FormData) {
  return saveSettings(storeSchema as unknown as z.ZodType<Record<string, unknown>>, fd);
}
export async function savePayments(_p: ActionState, fd: FormData): Promise<ActionState> {
  const res = await saveSettings(paymentsSchema as unknown as z.ZodType<Record<string, unknown>>, fd);
  if (res?.error) return res;
  // Secretos de MP: solo se actualizan si se completan (el campo vacío no borra)
  const token = String(fd.get("mp_access_token") ?? "").trim();
  const secret = String(fd.get("mp_webhook_secret") ?? "").trim();
  const patch: Record<string, string | null> = {};
  if (token) patch.mp_access_token = token === "-" ? null : token;
  if (secret) patch.mp_webhook_secret = secret === "-" ? null : secret;
  if (Object.keys(patch).length) await createAdminClient().from("private_settings").update(patch).eq("id", 1);
  return res;
}
export async function saveNotifications(_p: ActionState, fd: FormData) {
  return saveSettings(notifySchema as unknown as z.ZodType<Record<string, unknown>>, fd);
}

const bannersSchema = z.array(
  z.object({ image: z.string().max(1000), title: z.string().max(120).optional(), subtitle: z.string().max(200).optional(), link: z.string().max(300).optional() }),
).max(10);

export async function saveBanners(banners: z.input<typeof bannersSchema>): Promise<ActionState> {
  const err = await guard();
  if (err) return { error: err };
  const parsed = bannersSchema.safeParse(banners);
  if (!parsed.success) return { error: "Banners inválidos" };
  await createAdminClient().from("store_settings").update({ banners: parsed.data }).eq("id", 1);
  revalidatePath("/", "layout");
  return { ok: true, message: "Banners guardados" };
}

const shippingSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(80),
  description: opt,
  price: z.coerce.number().min(0),
  free_over: z.string().optional().transform((v) => (v && v.trim() !== "" ? Number(v) : null)),
  requires_address: bool,
  active: bool,
  sort_order: z.coerce.number().int().default(0),
});

export async function saveShipping(_p: ActionState, fd: FormData): Promise<ActionState> {
  const err = await guard();
  if (err) return { error: err };
  const parsed = shippingSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...row } = parsed.data;
  if (row.free_over !== null && Number.isNaN(row.free_over)) return { error: "Monto de envío gratis inválido" };
  const db = createAdminClient();
  const { error } = id ? await db.from("shipping_methods").update(row).eq("id", id) : await db.from("shipping_methods").insert(row);
  if (error) return { error: error.message };
  revalidatePath("/admin/configuracion");
  return { ok: true, message: "Método de envío guardado" };
}

export async function deleteShipping(fd: FormData) {
  if (await guard()) return;
  await createAdminClient().from("shipping_methods").delete().eq("id", String(fd.get("id")));
  revalidatePath("/admin/configuracion");
}

export async function testWeeklyReport(): Promise<ActionState> {
  const err = await guard();
  if (err) return { error: err };
  const res = await sendWeeklyReport();
  return res.sent ? { ok: true, message: "Reporte enviado al email del admin" } : { error: res.reason };
}
