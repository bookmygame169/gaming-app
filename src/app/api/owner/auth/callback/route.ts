import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, createOwnerSession, applyOwnerSessionCookie } from "@/lib/ownerAuth";
import { exchangeGoogleOAuthCode, fetchGoogleUserInfo } from "@/lib/googleOAuth";

export const dynamic = "force-dynamic";

function getSiteUrl(request: NextRequest): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET(request: NextRequest) {
  const siteUrl = getSiteUrl(request);
  const redirectUri = `${siteUrl}/api/owner/auth/callback`;
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");

  const loginRedirect = (error: string) =>
    NextResponse.redirect(`${siteUrl}/owner/login?error=${error}`);

  if (!code || searchParams.get("error")) {
    return loginRedirect("oauth_cancelled");
  }

  try {
    const tokens = await exchangeGoogleOAuthCode(code, redirectUri);
    if (!tokens.access_token) {
      console.error("Owner Google token exchange failed:", tokens.error);
      return loginRedirect("token_exchange_failed");
    }

    const userInfo = await fetchGoogleUserInfo(tokens.access_token);
    if (!userInfo.email) {
      return loginRedirect("no_email");
    }

    const email = userInfo.email.toLowerCase();
    const supabase = getSupabaseAdmin();

    const { data: allowed, error: dbError } = await supabase
      .from("owner_allowed_emails")
      .select("cafe_id, active")
      .eq("email", email)
      .limit(1)
      .single();

    if (dbError || !allowed?.cafe_id || allowed.active === false) {
      console.error(
        "owner_allowed_emails lookup failed:",
        dbError?.message,
        "email:",
        email,
        "row:",
        allowed
      );
      return loginRedirect("not_authorized");
    }

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
