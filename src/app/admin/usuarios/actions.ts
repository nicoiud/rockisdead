"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin, assertStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/env";
import { PERMISSIONS, type ActionState } from "@/lib/types";

export async function setUserActive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let me;
  try {
    me = await assertStaff("users");
  } catch (e) {
    return { error: (e as Error).message };
  }
  const id = z.uuid().parse(formData.get("id"));
  const active = formData.get("active") === "1";
  if (id === me.id) return { error: "No podés desactivar tu propia cuenta" };
  const db = createAdminClient();
  const { data: target } = await db.from("profiles").select("role").eq("id", id).single();
  if (target?.role !== "customer" && me.role !== "admin") return { error: "Solo un administrador puede desactivar staff" };
  await db.from("profiles").update({ active }).eq("id", id);
  // Bloquea/desbloquea el login en Supabase Auth
  await db.auth.admin.updateUserById(id, { ban_duration: active ? "none" : "876000h" });
  revalidatePath(`/admin/usuarios/${id}`);
  revalidatePath("/admin/usuarios");
  return { ok: true, message: active ? "Usuario activado" : "Usuario desactivado" };
}

const roleSchema = z.object({
  id: z.uuid(),
  role: z.enum(["customer", "staff", "admin"]),
});

export async function setUserRole(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let me;
  try {
    me = await assertAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }
  const parsed = roleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Datos inválidos" };
  const { id, role } = parsed.data;
  const permissions = formData.getAll("permissions").map(String).filter((p) => (PERMISSIONS as readonly string[]).includes(p));
  if (id === me.id && role !== "admin") return { error: "No podés quitarte el rol de administrador" };
  await createAdminClient()
    .from("profiles")
    .update({ role, permissions: role === "staff" ? permissions : [] })
    .eq("id", id);
  revalidatePath(`/admin/usuarios/${id}`);
  revalidatePath("/admin/usuarios");
  return { ok: true, message: "Rol actualizado" };
}

export async function addStaff(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await assertAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }
  const email = z.email().safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!email.success) return { error: "Email inválido" };
  const role = formData.get("role") === "admin" ? "admin" : "staff";
  const permissions = formData.getAll("permissions").map(String).filter((p) => (PERMISSIONS as readonly string[]).includes(p));
  const db = createAdminClient();

  let { data: profile } = await db.from("profiles").select("id").eq("email", email.data).maybeSingle();
  let invited = false;
  if (!profile) {
    const { data, error } = await db.auth.admin.inviteUserByEmail(email.data, { redirectTo: `${siteUrl()}/auth/callback?next=/nueva-clave` });
    if (error || !data.user) return { error: `No se pudo invitar: ${error?.message}` };
    invited = true;
    profile = { id: data.user.id };
    // El trigger crea el perfil; por las dudas lo aseguramos
    await db.from("profiles").upsert({ id: data.user.id, email: email.data }, { onConflict: "id", ignoreDuplicates: true });
  }
  await db.from("profiles").update({ role, permissions: role === "staff" ? permissions : [] }).eq("id", profile.id);
  revalidatePath("/admin/usuarios");
  return { ok: true, message: invited ? "Invitación enviada por email" : "Permisos asignados al usuario existente" };
}
