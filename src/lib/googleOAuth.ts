/**
 * Shared Google OAuth helpers for owner and admin sign-in callbacks.
 */

function getGoogleClientId(): string {
  const id = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  if (!id) {
    throw new Error("NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set");
  }
  return id;
}

function getGoogleClientSecret(): string {
  const secret =
    process.env.GOOGLE_CLIENT_SECRET?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET?.trim();
  if (!secret) {
    throw new Error("GOOGLE_CLIENT_SECRET is not set");
  }
  return secret;
}

export type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
};

export type GoogleUserInfo = {
  email?: string;
  given_name?: string;
  family_name?: string;
};

export async function exchangeGoogleOAuthCode(
  code: string,
  redirectUri: string
): Promise<GoogleTokenResponse> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: getGoogleClientId(),
      client_secret: getGoogleClientSecret(),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  return tokenRes.json() as Promise<GoogleTokenResponse>;
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return userRes.json() as Promise<GoogleUserInfo>;
}
