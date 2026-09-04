/**
 * The dashboard's write path.
 *
 * Counterpart to ownerLookup, which reads. Everything that changes something -
 * creating a booking, adjusting hours, ending a session - goes through here.
 *
 * It exists because the same twelve lines were written at over a hundred call
 * sites: set the JSON header, send the cookie, parse the body, check res.ok,
 * dig `error` out of the parsed body, and throw an Error carrying it. Written
 * out each time, the details drifted - some sites forgot `credentials`, some
 * threw the raw response object rather than an Error, and one of those is why
 * a failed save once reached the owner as "[object Object]".
 *
 * Unlike a lookup, this throws. A read that fails can show an empty list and
 * let the owner carry on; a write that fails must not look like it worked, so
 * the caller has to deal with it. The message is the server's own `error`
 * field where there is one, because that is the text worth showing.
 */

/** The shape every /api/owner/* route answers with when it refuses. */
type ErrorBody = { error?: string };

export class OwnerApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "OwnerApiError";
    this.status = status;
  }
}

type RequestOptions = {
  method?: "POST" | "PUT" | "PATCH" | "DELETE" | "GET";
  /** Serialised as JSON. Omit for GET. */
  body?: unknown;
  /** Used when the server sends no `error` of its own. */
  fallbackMessage?: string;
  signal?: AbortSignal;
};

/**
 * Calls an owner API route and returns its parsed body.
 *
 * Throws OwnerApiError if the route refuses, carrying the server's message and
 * status. A body that is not JSON is not an error by itself - some routes
 * answer 204 with nothing - so a parse failure only matters when the response
 * was already a failure, and the status carries the meaning in that case.
 */
export async function ownerApi<T = unknown>(
  path: string,
  { method = "POST", body, fallbackMessage, signal }: RequestOptions = {}
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  // Read once. A Response body can only be consumed a single time, and the
  // hand-written version of this occasionally called .json() in both the
  // success and the failure branch.
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    const fromServer = (parsed as ErrorBody | null)?.error;
    throw new OwnerApiError(
      fromServer || fallbackMessage || `Request failed (${res.status})`,
      res.status
    );
  }

  return parsed as T;
}
