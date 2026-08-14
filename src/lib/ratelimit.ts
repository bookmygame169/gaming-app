// lib/ratelimit.ts - Rate limiting utility using Upstash Redis
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

// Create Redis client
// Note: You need to set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in .env.local
const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

// In-memory fallback for development (when Redis is not configured)
class MemoryStore {
  private store: Map<string, { count: number; resetTime: number }> = new Map();

  async limit(identifier: string, limit: number, window: number): Promise<{ success: boolean; remaining: number }> {
    const now = Date.now();
    const record = this.store.get(identifier);

    if (!record || now > record.resetTime) {
      this.store.set(identifier, { count: 1, resetTime: now + window });
      return { success: true, remaining: limit - 1 };
    }

    if (record.count >= limit) {
      return { success: false, remaining: 0 };
    }

    record.count++;
    return { success: true, remaining: limit - record.count };
  }
}

const memoryStore = new MemoryStore();

// Rate limiter for booking creation (10 requests per 10 minutes per IP)
export const bookingRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "10 m"),
      analytics: true,
      prefix: "ratelimit:booking",
    })
  : null;

// Rate limiter for API routes (100 requests per minute per IP)
export const apiRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(100, "1 m"),
      analytics: true,
      prefix: "ratelimit:api",
    })
  : null;

// Rate limiter for authentication (5 requests per 5 minutes per IP)
export const authRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "5 m"),
      analytics: true,
      prefix: "ratelimit:auth",
    })
  : null;

// Rate limiter for email sends (10 requests per 10 minutes per IP)
export const emailRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "10 m"),
      analytics: true,
      prefix: "ratelimit:email",
    })
  : null;

// Helper function to get client IP from request
export function getClientIp(request: Request): string {
  // Try to get IP from headers (for proxied requests)
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Fallback to a default identifier
  return "unknown";
}

// In-memory rate limit check (fallback for development)
export async function checkRateLimit(
  identifier: string,
  limit: number = 100,
  windowMs: number = 60000
): Promise<{ success: boolean; remaining: number }> {
  if (redis) {
    // This shouldn't be called if Redis is configured
    throw new Error("Use the Ratelimit instances when Redis is configured");
  }
  return memoryStore.limit(identifier, limit, windowMs);
}

// Middleware helper for rate limiting
export async function rateLimit(
  request: Request,
  limiter: Ratelimit | null,
  fallbackLimit: number = 100,
  fallbackWindowMs: number = 60000
): Promise<{ success: boolean; remaining: number; error?: string }> {
  const identifier = getClientIp(request);

  if (limiter && redis) {
    const result = await limiter.limit(identifier);
    return {
      success: result.success,
      remaining: result.remaining,
      error: result.success ? undefined : "Rate limit exceeded. Please try again later.",
    };
  }

  // Fallback to in-memory rate limiting (development mode)
  const result = await checkRateLimit(identifier, fallbackLimit, fallbackWindowMs);
  return {
    success: result.success,
    remaining: result.remaining,
    error: result.success ? undefined : "Rate limit exceeded. Please try again later.",
  };
}

/** Returns a 429 response when the limit is exceeded, otherwise null. */
export async function enforceRateLimit(
  request: Request,
  limiter: Ratelimit | null,
  fallbackLimit: number = 100,
  fallbackWindowMs: number = 60000
): Promise<NextResponse | null> {
  const result = await rateLimit(request, limiter, fallbackLimit, fallbackWindowMs);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? "Rate limit exceeded. Please try again later." },
      { status: 429 }
    );
  }

  return null;
}
