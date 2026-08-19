import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * The password an administrator types to close a station's lock screen.
 *
 * Stored as a hash and nothing else. This value is served to every station, so
 * it ends up in a file on a PC a customer is signed into — and this repository
 * is public. Somebody who reads either learns nothing they can type.
 *
 * The format and parameters match ExitPassword.cs on the agent exactly, because
 * the agent is what verifies it. Changing either side alone locks every station
 * out of its own exit.
 */

/** Matches ExitPassword.Iterations in the agent. */
const ITERATIONS = 210_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

/** Builds the stored form. Never store or log the password itself. */
export function hashExitPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = pbkdf2Sync(password, salt, ITERATIONS, HASH_BYTES, "sha256");

  return `${ITERATIONS}.${salt.toString("base64")}.${hash.toString("base64")}`;
}

/**
 * Whether a password matches a stored hash.
 *
 * Not used by the station — the agent does its own checking, offline — but the
 * dashboard needs it to confirm the current password before replacing it.
 */
export function verifyExitPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored || !password) return false;

  try {
    const [iterationsText, saltText, hashText] = stored.split(".");
    const iterations = Number(iterationsText);
    if (!Number.isInteger(iterations) || iterations <= 0) return false;

    const expected = Buffer.from(hashText, "base64");
    const actual = pbkdf2Sync(password, Buffer.from(saltText, "base64"), iterations, expected.length, "sha256");

    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/** Whether a password is long enough to be worth setting. */
export function exitPasswordProblem(password: string): string | null {
  if (password.length < 6) return "Use at least 6 characters.";
  if (password.length > 128) return "That is too long — 128 characters at most.";
  return null;
}
