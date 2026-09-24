"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/env";
import { afterSignIn } from "@/lib/account";
import type { ActionState } from "@/lib/types";

function safeNext(next: FormDataEntryValue | null): string {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/cuenta";
}

export async function login(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error?.code === "email_not_confirmed") return { error: "Confirmá tu email antes de ingresar (revisá tu casilla)." };
    return { error: "Email o contraseña incorrectos" };
  }
  const { data: profile } = await createAdminClient().from("profiles").select("active").eq("id", data.user.id).maybeSingle();
  if (profile && !profile.active) {
    await supabase.auth.signOut();
    return { error: "Tu cuenta está deshabilitada. Contactanos." };
  }
  await afterSignIn(data.user);
  redirect(safeNext(formData.get("next")));
}

const registerSchema = z.object({
  full_name: z.string().trim().min(3, "Ingresá tu nombre y apellido"),
  email: z.email({ error: "Email inválido" }),
  phone: z.string().trim().optional(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export async function register(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email, password, full_name, phone } = parsed.data;
  const supabase = await createClient();
  const next = safeNext(formData.get("next"));
  const { data, error } = await supabase.auth.signUp({
    email: email.toLowerCase(),
    password,
    options: {
      data: { full_name, phone },
      emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) {
    if (error.code === "user_already_exists") return { error: "Ya existe una cuenta con ese email" };
    return { error: "No pudimos crear la cuenta: " + error.message };
  }
  if (data.session && data.user) {
    await afterSignIn(data.user);
    redirect(next);
  }
  return { ok: true, message: "¡Listo! Te enviamos un email para confirmar tu cuenta." };
}

export async function requestPasswordReset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Ingresá tu email" };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl()}/auth/callback?next=/nueva-clave` });
  return { ok: true, message: "Si el email está registrado, te enviamos un link para crear una nueva contraseña." };
}

export async function updatePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres" };
  if (password !== formData.get("confirm")) return { error: "Las contraseñas no coinciden" };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "El link expiró o es inválido. Pedí uno nuevo." };
  redirect("/cuenta?clave=ok");
}
