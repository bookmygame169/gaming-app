# scripts

## check-schema.mjs

```bash
npm run check:schema
```

Compares every table, column and function the code touches against the ones the
live database actually has, and exits non-zero if they disagree.

### Why this exists

`supabase/migrations/` is **not** a description of production. Several
migrations were never applied, and at least two can no longer be applied as
written — `20260117000001_create_coupons.sql` opens with
`DROP TABLE IF EXISTS coupons CASCADE`, which would delete live data.

So code gets written against the folder, compiles, deploys, and fails at
runtime. TypeScript cannot help: to it, a column name is just a string.

Three real outages came from exactly this:

| Symptom | Cause |
|---|---|
| "Could not place the booking" | insert named `coupon_id`, `coupon_discount`, `coupon_extra_minutes`; the table has `coupon_code` and `discount_amount` |
| Coupon codes always rejected | `validate_coupon` and `use_coupon` did not exist |
| Café onboarding always failed | `profiles` has no `email` or `name` column, and `profiles.id` is a foreign key to `auth.users` |

### What it checks

- Tables named in `.from("…")` exist
- Columns in `.insert()` / `.update()` / `.upsert()` payloads exist
- Functions in `.rpc("…")` exist

Only top-level payload keys count, so a nested options object
(`toLocaleTimeString(…, { hour: "numeric" })`) is not mistaken for a column.
Comments are ignored so prose is not read as code; string contents are kept,
because that is where the table names live.

`.select()` column lists are deliberately **not** parsed — they carry embedded
relationships and aliases, and a half-right parser that cries wolf is worse
than no check at all.

### Running it

Needs `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (the anon key
works too). Reads `.env.local` if they are not already in the environment.

It runs as part of `npm run build`, so a mismatch stops the deploy.

Only a mismatch it actually **found** exits non-zero. Missing credentials or an
unreachable database exit 0 with a warning: the check ran blind, which is not
evidence of a problem, and a release blocked over a network blip would get this
taken back out of the build within a week.

If a legitimate change needs to ship before its migration runs, use
`next build` directly — but the migration is the real fix.
