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

const OWNER_SESSION_COOKIE = "owner_session";
const OWNER_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

type OwnerProfileRole = "owner" | "admin" | "super_admin";

export type OwnerSession = {
  userId: string;
  username: string;
  expiresAt: number;
  issuedAt: number;
};

type OwnerContext = {
  ownerId: string;
  ownerUsername: string;
  role: OwnerProfileRole;
  supabase: SupabaseClient;
};

type OwnerAuthResult =
  | { context: OwnerContext; response: null }
  | { context: null; response: NextResponse };

function getOwnerSessionSecret(): string {
  return resolveSessionSecret("OWNER_SESSION_SECRET", "owner");
}

export function createOwnerSession(userId: string, username: string): OwnerSession {
  const now = Date.now();
  return {
    userId,
    username,
    issuedAt: now,
    expiresAt: now + OWNER_SESSION_TTL_MS,
  };
}

export function serializeOwnerSession(session: OwnerSession): string {
  const payload = encodeJsonBase64Url(session);
  const signature = signHmacPayload(payload, getOwnerSessionSecret());
  return `${payload}.${signature}`;
}

export function parseOwnerSession(token?: string | null): OwnerSession | null {
  if (!token) {
    return null;
  }

  const [payload, providedSignature] = token.split(".");
  if (!payload || !providedSignature) {
    return null;
  }

  if (!verifyHmacPayload(payload, providedSignature, getOwnerSessionSecret())) {
    return null;
  }

  try {
    const parsed = decodeJsonBase64Url<Partial<OwnerSession>>(payload);

    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.username !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }

    const now = Date.now();

    if (parsed.expiresAt <= now) {
      return null;
    }

    // issuedAt is optional for backward compat with existing sessions,
    // but must not be in the future (clock skew tolerance: 60s)
    if (typeof parsed.issuedAt === "number" && parsed.issuedAt > now + 60_000) {
      return null;
    }

    return {
      userId: parsed.userId,
      username: parsed.username,
      issuedAt: typeof parsed.issuedAt === "number" ? parsed.issuedAt : now,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

export function getOwnerSessionFromRequest(
  request: NextRequest
): OwnerSession | null {
  return parseOwnerSession(request.cookies.get(OWNER_SESSION_COOKIE)?.value);
}

export function applyOwnerSessionCookie(
  response: NextResponse,
  session: OwnerSession
): void {
  applyHttpOnlyCookie(response, {
    name: OWNER_SESSION_COOKIE,
    value: serializeOwnerSession(session),
    expires: new Date(session.expiresAt),
  });
}

export function clearOwnerSessionCookie(response: NextResponse): void {
  applyHttpOnlyCookie(response, {
    name: OWNER_SESSION_COOKIE,
    value: "",
    expires: new Date(0),
  });
}

function unauthorizedResponse(message = "Unauthorized"): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}

function invalidOwnerSessionResponse(
  message = "Owner session is no longer valid"
): NextResponse {
  const response = NextResponse.json({ error: message }, { status: 401 });
  clearOwnerSessionCookie(response);
  return response;
}

export function forbiddenResponse(message = "Forbidden"): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

export async function requireOwnerContext(
  request: NextRequest
): Promise<OwnerAuthResult> {
  const session = getOwnerSessionFromRequest(request);

  if (!session) {
    return { context: null, response: unauthorizedResponse() };
  }

  const supabase = getSupabaseAdmin();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.userId)
    .maybeSingle();

  if (error) {
    console.error("Owner auth profile lookup failed:", error);
    return {
      context: null,
      response: NextResponse.json({ error: "Failed to verify owner session" }, { status: 500 }),
    };
  }

  const role = profile?.role?.toLowerCase();
  const isOwnerRole =
    role === "owner" || role === "admin" || role === "super_admin";

  if (!isOwnerRole) {
    return {
      context: null,
      response: invalidOwnerSessionResponse(),
    };
  }

  return {
    context: {
      ownerId: session.userId,
      ownerUsername: session.username,
      role: role as OwnerProfileRole,
      supabase,
    },
    response: null,
  };
}

export async function ownerHasCafeAccess(
  supabase: SupabaseClient,
  ownerId: string,
  cafeId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("cafes")
    .select("id")
    .eq("id", cafeId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

export async function requireOwnerCafeAccess(
  supabase: SupabaseClient,
  ownerId: string,
  cafeId: string
): Promise<NextResponse | null> {
  const hasAccess = await ownerHasCafeAccess(supabase, ownerId, cafeId);
  return hasAccess ? null : forbiddenResponse("You do not have access to this cafe");
}

type TableWithCafeId =
  | "coupons"
  | "subscriptions"
  | "membership_plans"
  | "gallery_images"
  | "cafe_images"
  | "inventory_items"
  | "tournaments";

export async function getOwnedCafeIdForRecord(
  supabase: SupabaseClient,
  table: TableWithCafeId,
  recordId: string,
  ownerId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from(table)
    .select("cafe_id")
    .eq("id", recordId)
    .maybeSingle();

  if (error || !data?.cafe_id) {
    return null;
  }

  const hasAccess = await ownerHasCafeAccess(supabase, ownerId, data.cafe_id);
  return hasAccess ? data.cafe_id : null;
}

export async function getOwnedCafeIdForBooking(
  supabase: SupabaseClient,
  bookingId: string,
  ownerId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("bookings")
    .select("cafe_id")
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !data?.cafe_id) {
    return null;
  }

  const hasAccess = await ownerHasCafeAccess(supabase, ownerId, data.cafe_id);
  return hasAccess ? data.cafe_id : null;
}

export async function getOwnedBookingIdForBookingItem(
  supabase: SupabaseClient,
  bookingItemId: string,
  ownerId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("booking_items")
    .select("booking_id")
    .eq("id", bookingItemId)
    .maybeSingle();

  if (error || !data?.booking_id) {
    return null;
  }

  const cafeId = await getOwnedCafeIdForBooking(
    supabase,
    data.booking_id,
    ownerId
  );

  return cafeId ? data.booking_id : null;
}

export async function ownerHasCouponAccess(
  supabase: SupabaseClient,
  ownerId: string,
  couponId: string
): Promise<boolean> {
  const cafeId = await getOwnedCafeIdForRecord(
    supabase,
    "coupons",
    couponId,
    ownerId
  );

  return Boolean(cafeId);
}
