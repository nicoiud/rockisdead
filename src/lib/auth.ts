import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Permission, Profile } from "@/lib/types";

export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getUser();
  if (!user) return null;
  const { data } = await createAdminClient().from("profiles").select("*").eq("id", user.id).maybeSingle();
  return (data as Profile) ?? null;
});

export function isStaff(profile: Profile | null): boolean {
  return !!profile && profile.active && (profile.role === "admin" || profile.role === "staff");
}

export function hasPermission(profile: Profile | null, permission: Permission): boolean {
  if (!profile || !profile.active) return false;
  if (profile.role === "admin") return true;
  return profile.role === "staff" && profile.permissions.includes(permission);
}

export async function requireUser(next = "/cuenta") {
  const profile = await getProfile();
  if (!profile) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!profile.active) redirect("/login?error=inactive");
  return profile;
}

/** Para páginas de admin: redirige si no tiene acceso. */
export async function requireStaff(permission?: Permission) {
  const profile = await getProfile();
  if (!profile) redirect("/login?next=/admin");
  if (!isStaff(profile)) redirect("/");
  if (permission && !hasPermission(profile, permission)) redirect("/admin?error=permiso");
  return profile;
}

/** Para server actions y route handlers de admin: lanza error si no tiene acceso. */
export async function assertStaff(permission?: Permission) {
  const profile = await getProfile();
  if (!isStaff(profile)) throw new Error("No autorizado");
  if (permission && !hasPermission(profile, permission)) throw new Error("Sin permiso para esta sección");
  return profile!;
}

export async function assertAdmin() {
  const profile = await getProfile();
  if (!profile || !profile.active || profile.role !== "admin") throw new Error("Solo administradores");
  return profile;
}
