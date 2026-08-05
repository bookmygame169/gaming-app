import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, applyAdminSessionCookie, clearAdminSessionCookie, createAdminSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.rpc("verify_admin_login", {
      p_username: username.trim(),
      p_password: password,
    });

    if (error) {
      console.error("Admin login verification error:", error);
      return NextResponse.json({ error: "Login failed" }, { status: 500 });
    }

    if (!data || data.length === 0 || !data[0].is_valid) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const finalUsername = data[0].username || username.trim();
    const response = NextResponse.json({ userId: data[0].user_id, username: finalUsername });
    applyAdminSessionCookie(response, createAdminSession(data[0].user_id, finalUsername));
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
