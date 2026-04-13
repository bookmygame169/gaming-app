import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import {
  applyOwnerSessionCookie,
  clearOwnerSessionCookie,
  createOwnerSession,
} from "@/lib/ownerAuth";

export const dynamic = 'force-dynamic';

// Simple in-memory rate limiter: max 10 attempts per IP per 15 minutes
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true; // allowed
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false; // blocked
  }

  entry.count += 1;
  return true; // allowed
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        { status: 429 }
      );
    }

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
  const response = NextResponse.json({ success: true });
  clearOwnerSessionCookie(response);
  return response;
}
