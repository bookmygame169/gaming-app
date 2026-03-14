import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

const OWNER_SESSION_COOKIE = "owner_session";
const OWNER_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

type OwnerProfileRole = "owner" | "admin" | "super_admin";

export type OwnerSession = {
  userId: string;
  username: string;
  expiresAt: number;
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

let cachedSupabaseAdmin: SupabaseClient | null = null;

function getSupabaseServerKey(): string {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!key) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return key;
}

function getOwnerSessionSecret(): string {
  const secret =
    process.env.OWNER_SESSION_SECRET || getSupabaseServerKey();

  if (!secret) {
    throw new Error(
      "Missing OWNER_SESSION_SECRET or Supabase key for owner sessions."
    );
  }

  return secret;
}

function signOwnerSessionPayload(payload: string): string {
  return createHmac("sha256", getOwnerSessionSecret())
    .update(payload)
    .digest("base64url");
}

function toBase64UrlJson(value: OwnerSession): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function createOwnerSession(userId: string, username: string): OwnerSession {
  return {
    userId,
    username,
    expiresAt: Date.now() + OWNER_SESSION_TTL_MS,
  };
}

export function serializeOwnerSession(session: OwnerSession): string {
  const payload = toBase64UrlJson(session);
  const signature = signOwnerSessionPayload(payload);
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

  const expectedSignature = signOwnerSessionPayload(payload);

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
    ) as Partial<OwnerSession>;

    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.username !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }

    if (parsed.expiresAt <= Date.now()) {
      return null;
    }

    return {
      userId: parsed.userId,
      username: parsed.username,
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
  response.cookies.set({
    name: OWNER_SESSION_COOKIE,
    value: serializeOwnerSession(session),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(session.expiresAt),
  });
}

export function clearOwnerSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: OWNER_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
}

export function getSupabaseAdmin(): SupabaseClient {
  if (cachedSupabaseAdmin) {
    return cachedSupabaseAdmin;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = getSupabaseServerKey();

  if (!supabaseUrl) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL."
    );
  }

  cachedSupabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedSupabaseAdmin;
}

function unauthorizedResponse(message = "Unauthorized"): NextResponse {
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
      response: unauthorizedResponse("Owner session is no longer valid"),
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
  | "gallery_images";

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
