import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";

/**
 * HMAC-signed cookie helpers shared by owner and admin sessions.
 *
 * The two portals keep separate secrets, cookie names, and payload shapes.
 * Only the signing and cookie flags are shared so a third session type does
 * not copy the crypto again.
 */

export function getPublicCookieDomain(): string | undefined {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!configuredUrl) return undefined;

  try {
    const hostname = new URL(configuredUrl).hostname.toLowerCase();
    if (hostname === "www.bookmygame.co.in" || hostname === "bookmygame.co.in") {
      return "bookmygame.co.in";
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function resolveSessionSecret(envName: string, purpose: string): string {
  const dedicated = process.env[envName]?.trim();
  if (dedicated) return dedicated;

  const fallback =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!fallback) {
    throw new Error(`Missing ${envName} (and no Supabase key to derive one from).`);
  }

  if (process.env.NODE_ENV === "production") {
    console.error(
      `[auth] ${envName} is not set. Deriving a purpose-bound secret from the ` +
        `database key. Set ${envName} in Vercel so cookie signing is independent ` +
        `of the Supabase key.`
    );
  }

  return createHmac("sha256", fallback).update(`session-secret:${purpose}`).digest("hex");
}

export function signHmacPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function timingSafeEqualString(left: string, right: string): boolean {
  const leftBuf = Buffer.from(left);
  const rightBuf = Buffer.from(right);

  if (leftBuf.length !== rightBuf.length) {
    return false;
  }

  try {
    return timingSafeEqual(leftBuf, rightBuf);
  } catch {
    return false;
  }
}

export function verifyHmacPayload(
  payload: string,
  providedSignature: string,
  secret: string
): boolean {
  return timingSafeEqualString(signHmacPayload(payload, secret), providedSignature);
}

export function encodeJsonBase64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeJsonBase64Url<T>(payload: string): T {
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T;
}

export function applyHttpOnlyCookie(
  response: NextResponse,
  options: {
    name: string;
    value: string;
    expires: Date;
  }
): void {
  response.cookies.set({
    name: options.name,
    value: options.value,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: options.expires,
    domain: getPublicCookieDomain(),
  });
}
