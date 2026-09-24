import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, supabaseSecretKey } from "@/lib/env";

/**
 * Cliente con service role: saltea RLS. Usar SOLO en el servidor y
 * siempre después de validar sesión/permisos del usuario.
 */
export function createAdminClient() {
  return createClient(SUPABASE_URL, supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
