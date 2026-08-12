// lib/supabaseServer.ts (server-side use only)
import { createClient } from "@supabase/supabase-js";
import { noStoreFetch } from "@/lib/supabaseFetch";

// For server-side usage, we need to create a new client instance
export function getSupabaseServer() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables. Please check your .env.local file."
    );
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false, // Important for server-side
    },
    global: { fetch: noStoreFetch },
  });
}
