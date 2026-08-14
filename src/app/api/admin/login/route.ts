import { NextRequest, NextResponse } from "next/server";
import {
  applyAdminSessionCookie,
  clearAdminSessionCookie,
  createAdminSession,
  getSupabaseAdmin,
} from "@/lib/adminAuth";
import {
  ensureAdminProfileForEmail,
  HARDCODED_ADMIN_EMAIL,
  isHardcodedAdminLogin,
} from "@/lib/adminLoginAccount";
import { authRateLimiter, enforceRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await enforceRateLimit(
      request,
      authRateLimiter,
      5,
      5 * 60 * 1000
    );
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json().catch(() => ({}));
    const email = String(body?.email || body?.username || "")
      .trim()
      .toLowerCase();
    const password = String(body?.password || "");

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    if (!isHardcodedAdminLogin(email, password)) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const userId = await ensureAdminProfileForEmail(supabase, HARDCODED_ADMIN_EMAIL);

    if (!userId) {
      return NextResponse.json({ error: "Could not set up admin session" }, { status: 500 });
    }

    const response = NextResponse.json({ userId, email: HARDCODED_ADMIN_EMAIL });
    applyAdminSessionCookie(
      response,
      createAdminSession(userId, HARDCODED_ADMIN_EMAIL)
    );
    return response;
  } catch (err) {
    console.error("Admin login error:", err);
    return NextResponse.json({ error: "An error occurred during login" }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  clearAdminSessionCookie(response);
  return response;
}
