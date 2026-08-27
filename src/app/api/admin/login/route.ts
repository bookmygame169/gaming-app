import { NextRequest, NextResponse } from "next/server";
import {
  applyAdminSessionCookie,
  clearAdminSessionCookie,
  createAdminSession,
  getSupabaseAdmin,
} from "@/lib/adminAuth";
import { authenticateAdminLogin } from "@/lib/adminLoginAccount";
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
    const identifier = String(body?.email || body?.username || "").trim();
    const password = String(body?.password || "");

    if (!identifier || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const session = await authenticateAdminLogin(supabase, identifier, password);

    if (!session) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const response = NextResponse.json({
      userId: session.userId,
      email: session.username,
    });
    applyAdminSessionCookie(
      response,
      createAdminSession(session.userId, session.username)
    );
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Admin login error:", err);

    if (message.includes("Could not set up")) {
      return NextResponse.json({ error: "Could not set up admin session" }, { status: 500 });
    }

    return NextResponse.json({ error: "An error occurred during login" }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  clearAdminSessionCookie(response);
  return response;
}
