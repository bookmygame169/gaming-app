import { NextRequest, NextResponse } from "next/server";
import {
  applyAdminSessionCookie,
  createAdminSession,
  getSupabaseAdmin,
} from "@/lib/adminAuth";
import { exchangeGoogleOAuthCode, fetchGoogleUserInfo } from "@/lib/googleOAuth";

export const dynamic = "force-dynamic";

function getSiteUrl(request: NextRequest): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

async function findAuthUserIdByEmail(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  email: string
): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) {
    console.error("Could not list auth users:", error.message);
    return null;
  }

  const match = data?.users?.find((user) => user.email?.toLowerCase() === email);
  return match?.id ?? null;
}

export async function GET(request: NextRequest) {
  const siteUrl = getSiteUrl(request);
  const redirectUri = `${siteUrl}/api/admin/auth/callback`;
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");

  const loginRedirect = (error: string) =>
    NextResponse.redirect(`${siteUrl}/admin/login?error=${error}`);

  if (!code || searchParams.get("error")) {
    return loginRedirect("oauth_cancelled");
  }

  try {
    const tokens = await exchangeGoogleOAuthCode(code, redirectUri);
    if (!tokens.access_token) {
      console.error("Admin Google token exchange failed:", tokens.error);
      return loginRedirect("token_exchange_failed");
    }

    const userInfo = await fetchGoogleUserInfo(tokens.access_token);
    if (!userInfo.email) {
      return loginRedirect("no_email");
    }

    const email = userInfo.email.toLowerCase();
    const supabase = getSupabaseAdmin();

    const { data: allowed, error: allowError } = await supabase
      .from("admin_allowed_emails")
      .select("id, active")
      .eq("email", email)
      .maybeSingle();

    if (allowError) {
      console.error("admin_allowed_emails lookup failed:", allowError.message, "email:", email);
      return loginRedirect("server_error");
    }

    if (!allowed || allowed.active === false) {
      return loginRedirect("not_authorized");
    }

    let userId = await findAuthUserIdByEmail(supabase, email);

    if (!userId) {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
      });

      if (createErr || !created?.user) {
        console.error("Failed to create admin auth user:", createErr?.message);
        return loginRedirect("server_error");
      }

      userId = created.user.id;
    }

    const firstName = userInfo.given_name || email.split("@")[0];
    const lastName = userInfo.family_name || null;

    const { error: profileErr } = await supabase.from("profiles").upsert(
      {
        id: userId,
        first_name: firstName,
        last_name: lastName,
        role: "admin",
        is_admin: true,
      },
      { onConflict: "id" }
    );

    if (profileErr) {
      console.error("Failed to upsert admin profile:", profileErr.message);
      return loginRedirect("server_error");
    }

    const response = NextResponse.redirect(`${siteUrl}/admin`);
    applyAdminSessionCookie(response, createAdminSession(userId, email));
    return response;
  } catch (err) {
    console.error("Admin OAuth callback error:", err);
    return loginRedirect("server_error");
  }
}
