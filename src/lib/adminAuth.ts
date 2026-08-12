import { createHmac, timingSafeEqual } from "node:crypto";
import { noStoreFetch } from "@/lib/supabaseFetch";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

const ADMIN_SESSION_COOKIE = "admin_session";
const ADMIN_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export type AdminSession = {
  userId: string;
  username: string;
  expiresAt: number;
};

type AdminContext = {
  adminId: string;
  adminUsername: string;
  role: string;
  supabase: SupabaseClient;
};

type AdminAuthResult =
  | { context: AdminContext; response: null }
  | { context: null; response: NextResponse };

let cachedSupabaseAdmin: SupabaseClient | null = null;

function getAdminCookieDomain(): string | undefined {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!configuredUrl) return undefined;
  try {
    const hostname = new URL(configuredUrl).hostname.toLowerCase();
    if (hostname === "www.bookmygame.co.in" || hostname === "bookmygame.co.in") {
      return "bookmygame.co.in";
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function getSupabaseServerKey(): string {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  return key;
}

function getAdminSessionSecret(): string {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.OWNER_SESSION_SECRET ||
    getSupabaseServerKey()
  );
}

function signAdminSessionPayload(payload: string): string {
  return createHmac("sha256", getAdminSessionSecret())
    .update(payload)
    .digest("base64url");
}

function toBase64UrlJson(value: AdminSession): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function createAdminSession(userId: string, username: string): AdminSession {
  return {
    userId,
    username,
    expiresAt: Date.now() + ADMIN_SESSION_TTL_MS,
  };
}

export function serializeAdminSession(session: AdminSession): string {
  const payload = toBase64UrlJson(session);
  const signature = signAdminSessionPayload(payload);
  return `${payload}.${signature}`;
}

export function parseAdminSession(token?: string | null): AdminSession | null {
  if (!token) return null;

  const [payload, providedSignature] = token.split(".");
  if (!payload || !providedSignature) return null;

  const expectedSignature = signAdminSessionPayload(payload);

  try {
    if (
      !timingSafeEqual(
        Buffer.from(providedSignature),
        Buffer.from(expectedSignature)
      )
    ) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as Partial<AdminSession>;

    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.username !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }

    if (parsed.expiresAt <= Date.now()) return null;

    return {
      userId: parsed.userId,
      username: parsed.username,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

export function getAdminSessionFromRequest(request: NextRequest): AdminSession | null {
  return parseAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
}

export function applyAdminSessionCookie(response: NextResponse, session: AdminSession): void {
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: serializeAdminSession(session),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(session.expiresAt),
    domain: getAdminCookieDomain(),
  });
}

export function clearAdminSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
    domain: getAdminCookieDomain(),
  });
}

export function getSupabaseAdmin(): SupabaseClient {
  if (cachedSupabaseAdmin) return cachedSupabaseAdmin;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = getSupabaseServerKey();

  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  }

  cachedSupabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: noStoreFetch },
  });

  return cachedSupabaseAdmin;
}

function unauthorizedResponse(message = "Unauthorized"): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}

function invalidAdminSessionResponse(message = "Admin session is no longer valid"): NextResponse {
  const response = NextResponse.json({ error: message }, { status: 401 });
  clearAdminSessionCookie(response);
  return response;
}

export function forbiddenResponse(message = "Forbidden"): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

export async function requireAdminContext(request: NextRequest): Promise<AdminAuthResult> {
  const session = getAdminSessionFromRequest(request);

  if (!session) {
    return { context: null, response: unauthorizedResponse() };
  }

  const supabase = getSupabaseAdmin();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, is_admin")
    .eq("id", session.userId)
    .maybeSingle();

  if (error) {
    console.error("Admin auth profile lookup failed:", error);
    return {
      context: null,
      response: NextResponse.json({ error: "Failed to verify admin session" }, { status: 500 }),
    };
  }

  const role = profile?.role?.toLowerCase();
  const isReallyAdmin =
    role === "admin" || role === "super_admin" || profile?.is_admin === true;

  if (!isReallyAdmin) {
    return { context: null, response: invalidAdminSessionResponse() };
  }

  return {
    context: {
      adminId: session.userId,
      adminUsername: session.username,
      role: role ?? "admin",
      supabase,
    },
    response: null,
  };
}
