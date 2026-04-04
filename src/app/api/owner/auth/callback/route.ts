import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, createOwnerSession, applyOwnerSessionCookie } from "@/lib/ownerAuth";

export const dynamic = "force-dynamic";

function getSiteUrl(request: NextRequest): string {
  // Derive origin from the incoming request so it works on any domain/port
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET(request: NextRequest) {
  const siteUrl = getSiteUrl(request);
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");

  const loginRedirect = (error: string) =>
    NextResponse.redirect(`${siteUrl}/owner/login?error=${error}`);

  if (!code || searchParams.get("error")) {
    return loginRedirect("oauth_cancelled");
  }

  try {
    // Exchange code for Google access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
        client_secret: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${siteUrl}/api/owner/auth/callback`,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.access_token) {
      return loginRedirect("token_exchange_failed");
    }

    // Get user email from Google
    const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userInfo = await userRes.json();
    if (!userInfo.email) {
      return loginRedirect("no_email");
    }

    const email = userInfo.email.toLowerCase();
    const supabase = getSupabaseAdmin();

    // Check if this email is authorized
    const { data: allowed } = await supabase
      .from("owner_allowed_emails")
      .select("cafe_id, active")
      .eq("email", email)
      .eq("active", true)
      .maybeSingle();

    if (!allowed?.cafe_id) {
      return loginRedirect("not_authorized");
    }

    // Get the cafe's owner_id — session uses that so existing auth middleware works unchanged
    const { data: cafe } = await supabase
      .from("cafes")
      .select("owner_id")
      .eq("id", allowed.cafe_id)
      .maybeSingle();

    if (!cafe?.owner_id) {
      return loginRedirect("cafe_not_found");
    }

    const response = NextResponse.redirect(`${siteUrl}/owner`);
    applyOwnerSessionCookie(response, createOwnerSession(cafe.owner_id, email));
    return response;
  } catch (err) {
    console.error("OAuth callback error:", err);
    return loginRedirect("server_error");
  }
}
