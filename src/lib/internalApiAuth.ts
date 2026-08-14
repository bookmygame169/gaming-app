import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

function secretsMatch(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

/**
 * Guard for server-to-server routes (e.g. /api/email).
 * Returns a 401/503 response when the caller is not authorized, otherwise null.
 */
export function requireInternalApiSecret(request: NextRequest): NextResponse | null {
  const secret = process.env.INTERNAL_API_SECRET?.trim();

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
    }
    return null;
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (!token || !secretsMatch(token, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
