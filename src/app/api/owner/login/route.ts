import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  applyOwnerSessionCookie,
  clearOwnerSessionCookie,
  createOwnerSession,
} from "@/lib/ownerAuth";
import { authRateLimiter, enforceRateLimit } from "@/lib/ratelimit";


export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Service role, not the browser client: this route calls a function
  // that runs as its owner and is deliberately not callable by anon.
  const supabase = getSupabaseAdmin();

  try {
    const rateLimitResponse = await enforceRateLimit(
      request,
      authRateLimiter,
      5,
      5 * 60 * 1000
    );
    if (rateLimitResponse) return rateLimitResponse;

    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc('verify_owner_login', {
      p_username: username,
      p_password: password
    });

    if (error) {
      console.error("Login verification error:", error);
      return NextResponse.json(
        { error: error.message || 'Unknown error' },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    if (!data[0].is_valid) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      userId: data[0].user_id,
      username: data[0].username,
    });

    applyOwnerSessionCookie(
      response,
      createOwnerSession(data[0].user_id, data[0].username)
    );

    return response;
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json(
      { error: "An error occurred during login" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  // Signing out only clears a cookie — no database work, so no client.
  const response = NextResponse.json({ success: true });
  clearOwnerSessionCookie(response);
  return response;
}
