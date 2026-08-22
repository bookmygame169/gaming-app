import { NextRequest, NextResponse } from "next/server";
import {
  applyAdminSessionCookie,
  clearAdminSessionCookie,
  createAdminSession,
  getSupabaseAdmin,
} from "@/lib/adminAuth";
import {
  configuredAdminEmail,
  ensureAdminProfileForEmail,
  isConfiguredAdminLogin,
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

    if (!isConfiguredAdminLogin(email, password)) {
      if (!configuredAdminEmail()) {
        console.error("ADMIN_LOGIN_EMAIL / ADMIN_LOGIN_PASSWORD are not set.");
        return NextResponse.json({ error: "Admin login is not configured" }, { status: 503 });
      }
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const adminEmail = configuredAdminEmail()!;
    const supabase = getSupabaseAdmin();
    const userId = await ensureAdminProfileForEmail(supabase, adminEmail);

    if (!userId) {
      return NextResponse.json({ error: "Could not set up admin session" }, { status: 500 });
    }

    const response = NextResponse.json({ userId, email: adminEmail });
    applyAdminSessionCookie(
      response,
      createAdminSession(userId, adminEmail)
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
