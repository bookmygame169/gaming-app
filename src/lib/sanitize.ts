// lib/sanitize.ts - Input sanitization utilities
import validator from "validator";

/**
 * Sanitize text input to prevent XSS attacks
 * Removes HTML tags and potentially dangerous characters
 */
export function sanitizeText(input: string): string {
  if (!input || typeof input !== "string") return "";

  // Remove HTML tags
  let sanitized = input.replace(/<[^>]*>/g, "");

  // Remove script tags and their content
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");

  // Trim whitespace
  sanitized = sanitized.trim();

  // Limit length to prevent DoS
  const MAX_LENGTH = 10000;
  if (sanitized.length > MAX_LENGTH) {
    sanitized = sanitized.substring(0, MAX_LENGTH);
  }

  return sanitized;
}

/**
 * Sanitize and validate email address
 */
export function sanitizeEmail(email: string): string | null {
  if (!email || typeof email !== "string") return null;

  const trimmed = email.trim().toLowerCase();

  if (!validator.isEmail(trimmed)) {
    return null;
  }

  return trimmed;
}

/**
 * Sanitize phone number (Indian format)
 */
export function sanitizePhone(phone: string): string | null {
  if (!phone || typeof phone !== "string") return null;

  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, "");

  // Indian phone numbers are 10 digits (without country code) or 12 digits (with +91)
  if (digits.length === 10) {
    return digits;
  } else if (digits.length === 12 && digits.startsWith("91")) {
    return digits.substring(2);
  }

  return null;
}

/**
 * Sanitize numeric input
 */
export function sanitizeNumber(input: string | number, options?: { min?: number; max?: number }): number | null {
  let num: number;

  if (typeof input === "string") {
    num = parseFloat(input);
  } else if (typeof input === "number") {
    num = input;
  } else {
    return null;
  }

  if (isNaN(num) || !isFinite(num)) {
    return null;
  }

  if (options?.min !== undefined && num < options.min) {
    return null;
  }

  if (options?.max !== undefined && num > options.max) {
    return null;
  }

  return num;
}

/**
 * Sanitize URL
 */
export function sanitizeUrl(url: string): string | null {
  if (!url || typeof url !== "string") return null;

  const trimmed = url.trim();

  if (!validator.isURL(trimmed, { require_protocol: true, protocols: ["http", "https"] })) {
    return null;
  }

  return trimmed;
}

/**
 * Sanitize date string (ISO format)
 */
export function sanitizeDate(date: string): string | null {
  if (!date || typeof date !== "string") return null;

  const trimmed = date.trim();

  // Check if it's a valid ISO date (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const dateObj = new Date(trimmed);
  if (isNaN(dateObj.getTime())) {
    return null;
  }

  return trimmed;
}

/**
 * Sanitize time string (12-hour format)
 */
export function sanitizeTime(time: string): string | null {
  if (!time || typeof time !== "string") return null;

  const trimmed = time.trim().toLowerCase();

  // Check if it matches 12-hour format (e.g., "2:30 pm", "10:00 am")
  if (!/^\d{1,2}:\d{2}\s*(am|pm)$/i.test(trimmed)) {
    return null;
  }

  return trimmed;
}

/**
 * Sanitize enum value (ensure it's one of the allowed values)
 */
export function sanitizeEnum<T extends string>(value: string, allowedValues: readonly T[]): T | null {
  if (!value || typeof value !== "string") return null;

  const trimmed = value.trim() as T;

  if (!allowedValues.includes(trimmed)) {
    return null;
  }

  return trimmed;
}

/**
 * Sanitize UUID
 */
export function sanitizeUUID(uuid: string): string | null {
  if (!uuid || typeof uuid !== "string") return null;

  const trimmed = uuid.trim();

  if (!validator.isUUID(trimmed)) {
    return null;
  }

  return trimmed;
}

/**
 * Sanitize boolean value
 */
export function sanitizeBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const lower = value.toLowerCase().trim();
    return lower === "true" || lower === "1" || lower === "yes";
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  return false;
}

/**
 * Sanitize object by applying sanitizers to each field
 */
export function sanitizeObject<T extends Record<string, unknown>>(
  obj: T,
  schema: { [K in keyof T]?: (value: unknown) => unknown }
): Partial<T> {
  const sanitized: Partial<T> = {};

  for (const key in schema) {
    if (obj.hasOwnProperty(key)) {
      const sanitizer = schema[key];
      if (sanitizer) {
        const sanitizedValue = sanitizer(obj[key]);
        if (sanitizedValue !== null && sanitizedValue !== undefined) {
          sanitized[key] = sanitizedValue as T[Extract<keyof T, string>];
        }
      }
    }
  }

  return sanitized;
}

/**
 * The message from something thrown, whatever was thrown.
 *
 * `catch (err: any)` then `err.message` was written in eight route handlers.
 * It reads fine and is a lie: JavaScript lets any value be thrown, and if a
 * string or an object reaches one of those blocks then `.message` is undefined
 * and the caller is told nothing went wrong except a blank error.
 *
 * `catch (err)` gives `unknown`, which is the truth, and this turns it into
 * something safe to send.
 */
export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;

  // Supabase and fetch both reject with plain objects carrying a message.
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }

  return fallback;
}
