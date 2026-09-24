import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StoreSettings } from "@/lib/types";

export const getSettings = cache(async (): Promise<StoreSettings> => {
  const { data, error } = await createAdminClient().from("store_settings").select("*").eq("id", 1).single();
  if (error) throw error;
  return data as StoreSettings;
});

export async function getPrivateSettings(): Promise<{ mp_access_token: string | null; mp_webhook_secret: string | null }> {
  const { data } = await createAdminClient()
    .from("private_settings")
    .select("mp_access_token, mp_webhook_secret")
    .eq("id", 1)
    .single();
  return {
    // La configuración del admin tiene prioridad; si no, variables de entorno.
    mp_access_token: data?.mp_access_token || process.env.MP_ACCESS_TOKEN || null,
    mp_webhook_secret: data?.mp_webhook_secret || process.env.MP_WEBHOOK_SECRET || null,
  };
}
