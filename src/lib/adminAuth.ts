import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import {
  applyHttpOnlyCookie,
  encodeJsonBase64Url,
  decodeJsonBase64Url,
  resolveSessionSecret,
  signHmacPayload,
  verifyHmacPayload,
} from "@/lib/signedCookie";

export { getSupabaseAdmin };

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

function getAdminSessionSecret(): string {
  return resolveSessionSecret("ADMIN_SESSION_SECRET", "admin");
}

export function createAdminSession(userId: string, username: string): AdminSession {
  return {
    userId,
    username,
    expiresAt: Date.now() + ADMIN_SESSION_TTL_MS,
  };
}

export function serializeAdminSession(session: AdminSession): string {
  const payload = encodeJsonBase64Url(session);
  const signature = signHmacPayload(payload, getAdminSessionSecret());
  return `${payload}.${signature}`;
}

export function parseAdminSession(token?: string | null): AdminSession | null {
  if (!token) return null;

  const [payload, providedSignature] = token.split(".");
  if (!payload || !providedSignature) return null;

  if (!verifyHmacPayload(payload, providedSignature, getAdminSessionSecret())) {
    return null;
  }

  try {
    const parsed = decodeJsonBase64Url<Partial<AdminSession>>(payload);

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
  applyHttpOnlyCookie(response, {
    name: ADMIN_SESSION_COOKIE,
    value: serializeAdminSession(session),
    expires: new Date(session.expiresAt),
  });
}

export function clearAdminSessionCookie(response: NextResponse): void {
  applyHttpOnlyCookie(response, {
    name: ADMIN_SESSION_COOKIE,
    value: "",
    expires: new Date(0),
  });
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
