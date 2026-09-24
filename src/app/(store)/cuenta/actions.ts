"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import type { ActionState } from "@/lib/types";

const profileSchema = z.object({
  full_name: z.string().trim().min(3, "Ingresá tu nombre y apellido"),
  phone: z.string().trim().max(30).optional(),
  document: z.string().trim().max(20).optional(),
});

export async function updateProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireUser();
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  // Cliente con sesión: RLS + permisos de columna limitan qué puede cambiar
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.full_name, phone: parsed.data.phone || null, document: parsed.data.document || null })
    .eq("id", profile.id);
  if (error) return { error: "No se pudo guardar" };
  revalidatePath("/cuenta");
  return { ok: true, message: "Datos actualizados" };
}

export async function changePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "Mínimo 8 caracteres" };
  if (password !== formData.get("confirm")) return { error: "Las contraseñas no coinciden" };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "No se pudo cambiar la contraseña: " + error.message };
  return { ok: true, message: "Contraseña actualizada" };
}

const addressSchema = z.object({
  label: z.string().trim().max(40).optional(),
  recipient: z.string().trim().min(2, "Ingresá quién recibe"),
  phone: z.string().trim().optional(),
  street: z.string().trim().min(2, "Ingresá la calle"),
  number: z.string().trim().min(1, "Ingresá la altura"),
  apartment: z.string().trim().optional(),
  city: z.string().trim().min(2, "Ingresá la localidad"),
  province: z.string().trim().min(2, "Ingresá la provincia"),
  postal_code: z.string().trim().min(3, "Ingresá el código postal"),
  notes: z.string().trim().optional(),
});

export async function saveAddress(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireUser();
  const parsed = addressSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const isDefault = formData.get("is_default") === "1";
  if (isDefault) await supabase.from("addresses").update({ is_default: false }).eq("user_id", profile.id);
  const row = { ...parsed.data, user_id: profile.id, ...(isDefault ? { is_default: true } : {}) };
  const { error } = id
    ? await supabase.from("addresses").update(row).eq("id", id).eq("user_id", profile.id)
    : await supabase.from("addresses").insert(row);
  if (error) return { error: "No se pudo guardar la dirección" };
  revalidatePath("/cuenta/direcciones");
  return { ok: true, message: "Dirección guardada" };
}

export async function deleteAddress(formData: FormData) {
  const profile = await requireUser();
  const supabase = await createClient();
  await supabase.from("addresses").delete().eq("id", String(formData.get("id"))).eq("user_id", profile.id);
  revalidatePath("/cuenta/direcciones");
}

export async function setDefaultAddress(formData: FormData) {
  const profile = await requireUser();
  const supabase = await createClient();
  await supabase.from("addresses").update({ is_default: false }).eq("user_id", profile.id);
  await supabase.from("addresses").update({ is_default: true }).eq("id", String(formData.get("id"))).eq("user_id", profile.id);
  revalidatePath("/cuenta/direcciones");
}
