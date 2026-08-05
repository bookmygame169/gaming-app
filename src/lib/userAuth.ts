// lib/userAuth.ts (server-side use only)
// Verifies the Supabase Auth access token for customer-facing API routes.
// The browser client (src/lib/supabaseClient.ts) stores its session in
// localStorage, not cookies, so callers must send the access token via
// `Authorization: Bearer <token>` (see supabase.auth.getSession() on the
// client) rather than relying on request cookies.
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

type UserAuthResult =
  | { userId: string; response: null }
  | { userId: null; response: NextResponse };

export async function requireUser(request: NextRequest): Promise<UserAuthResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      userId: null,
      response: NextResponse.json({ error: "Server misconfigured" }, { status: 500 }),
    };
  }

  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!accessToken) {
    return {
      userId: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data?.user) {
    return {
      userId: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { userId: data.user.id, response: null };
}
