import { NextRequest, NextResponse } from "next/server";
import {
  clearOwnerSessionCookie,
  getOwnerSessionFromRequest,
  getSupabaseAdmin,
} from "@/lib/ownerAuth";

export const dynamic = "force-dynamic";

async function verifyOwnerSession(request: NextRequest) {
  const session = getOwnerSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({
      userId: null,
      username: null,
      role: null,
      isOwner: false,
    });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session.userId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const role = profile?.role?.toLowerCase();
    const isOwner =
      role === "owner" || role === "admin" || role === "super_admin";

    if (!isOwner) {
      const response = NextResponse.json(
        {
          userId: null,
          username: null,
          role,
          isOwner: false,
        }
      );
      clearOwnerSessionCookie(response);
      return response;
    }

    return NextResponse.json({
      userId: session.userId,
      username: session.username,
      role,
      isOwner: true,
    });
  } catch (err) {
    console.error("Verify error:", err);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return verifyOwnerSession(request);
}

export async function POST(request: NextRequest) {
  return verifyOwnerSession(request);
}
