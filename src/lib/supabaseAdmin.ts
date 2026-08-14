import { noStoreFetch } from "@/lib/supabaseFetch";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedSupabaseAdmin: SupabaseClient | null = null;

/**
 * Service role key for server-side Supabase writes.
 * In production the service role key is required — falling back to the anon
 * key would silently break writes or behave unpredictably under RLS.
 */
export function getSupabaseServiceRoleKey(): string {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (serviceRoleKey) {
    return serviceRoleKey;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required in production.");
  }

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY in development)."
    );
  }

  return anonKey;
}

export function getSupabaseAdmin(): SupabaseClient {
  if (cachedSupabaseAdmin) {
    return cachedSupabaseAdmin;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  }

  cachedSupabaseAdmin = createClient(supabaseUrl, getSupabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: noStoreFetch },
  });

  return cachedSupabaseAdmin;
}
