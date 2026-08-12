/**
 * The fetch every server-side Supabase client should use.
 *
 * Next caches fetch responses inside route handlers, and the Supabase client
 * talks to PostgREST through fetch — so a GET route can re-run on every request,
 * look correct, and still hand back a cached copy of the database from minutes
 * or days ago. `export const dynamic = "force-dynamic"` does not help: it
 * governs how the route is rendered, not what its own outbound requests do.
 *
 * This was caught on the live-availability endpoint, which reported three-day-
 * old station state while the row in front of us said otherwise. The same
 * client construction is used by the owner dashboard, the wallet and the
 * points pages — balances and machine status are exactly the things nobody
 * should be shown a stale copy of.
 *
 * Applied in the shared client factories rather than route by route, so a route
 * added later inherits it instead of having to remember.
 */
export const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: "no-store" });
