/**
 * Rewrites the station names already stored against bookings into the one form
 * the application recognises.
 *
 * The migration that created booking_items.station_names copied the values out
 * of the title exactly as they were written, because canonicalising them in SQL
 * would have meant a second copy of rules that live in TypeScript. So the column
 * currently holds what a year of bookings actually recorded:
 *
 *     PS5-01        beside   ps5-01
 *     racing sim-01 beside   racing_sim-01
 *     3 Consoles             — a description that was entered where a machine
 *                              name belongs. It normalises to '3_consoles',
 *                              which is not dropped and is not a real station,
 *                              so that booking points at a machine that does
 *                              not exist.
 *
 * Reads still agree, because both the column and the title fallback pass every
 * value through normaliseStationName() before use. What suffers is everything
 * treating the stored value as data: the GIN index cannot match across
 * spellings, and a name nothing recognises unlocks nothing.
 *
 * This applies the same function the application applies, imported rather than
 * reimplemented — a second copy of that rule would drift, which is the problem
 * being fixed.
 *
 * Usage:
 *   npx tsx scripts/normalise-station-names.ts            # show the diff, change nothing
 *   npx tsx scripts/normalise-station-names.ts --apply    # write it
 *
 * Safe to run twice: a row already in canonical form produces no change.
 */

import { readFileSync } from "node:fs";
import { normaliseStationName } from "@/lib/stationNames";

// ---------------------------------------------------------------- environment

function loadEnv() {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const apply = process.argv.includes("--apply");

/**
 * Collapse a station listed twice into one.
 *
 * Off by default, because it changes what a row says rather than how it is
 * spelled. 'racing sim-01, racing_sim-01' is one machine written two ways, and
 * the readers already produce a duplicate from it today — so writing the
 * duplicate is faithful to current behaviour and removing it is a decision.
 */
const dedupe = process.argv.includes("--dedupe");
const headers = { apikey: key, Authorization: `Bearer ${key}` };

type Item = {
  id: string;
  booking_id: string | null;
  title: string | null;
  station_names: string[] | null;
};

// ---------------------------------------------------------------------- read

/** Every row, not the first thousand. See lib/db/pagination for why. */
async function readAll(): Promise<Item[]> {
  const rows: Item[] = [];

  for (let from = 0; ; from += 1000) {
    const response = await fetch(
      `${url}/rest/v1/booking_items?select=id,booking_id,title,station_names&station_names=not.is.null`,
      { headers: { ...headers, Range: `${from}-${from + 999}` } }
    );

    if (!response.ok) {
      throw new Error(`Read failed: HTTP ${response.status} ${await response.text()}`);
    }

    const page = (await response.json()) as Item[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

// ------------------------------------------------------------------- compare

type Change = {
  id: string;
  bookingId: string | null;
  before: string[];
  after: string[];
  /** Names that resolve to nothing — these were never real stations. */
  dropped: string[];
};

function planChanges(items: Item[]): Change[] {
  const changes: Change[] = [];

  for (const item of items) {
    const before = item.station_names ?? [];

    // The application's own rule, applied exactly as the readers apply it.
    const normalised = before.map((name) => normaliseStationName(name)).filter(Boolean);
    const after = dedupe ? [...new Set(normalised)] : normalised;
    const dropped = before.filter((name) => !normaliseStationName(name));

    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes.push({ id: item.id, bookingId: item.booking_id, before, after, dropped });
    }
  }

  return changes;
}

// --------------------------------------------------------------------- write

async function write(change: Change): Promise<string | null> {
  // station_names is sent explicitly, so the trigger leaves it alone — it only
  // derives a value when the caller supplies none. The title is deliberately
  // untouched: it is a label, and rewriting a customer-visible string is a
  // bigger decision than fixing the data behind it.
  const response = await fetch(`${url}/rest/v1/booking_items?id=eq.${change.id}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ station_names: change.after.length > 0 ? change.after : null }),
  });

  return response.ok ? null : `HTTP ${response.status} ${await response.text()}`;
}

// ---------------------------------------------------------------------- main

async function main() {
  const items = await readAll();
  const changes = planChanges(items);

  console.log(`\nRows with a stored assignment: ${items.length}`);
  console.log(`Rows needing a change:         ${changes.length}\n`);

  if (changes.length === 0) {
    console.log("Everything is already in canonical form. Nothing to do.\n");
    return;
  }

  // Grouped, because 1,800 rows of output is not a diff anyone reads. What
  // matters is which spellings exist and what each becomes.
  const byShape = new Map<string, { count: number; example: Change }>();

  for (const change of changes) {
    const shape = `${JSON.stringify(change.before)} -> ${JSON.stringify(change.after)}`;
    const seen = byShape.get(shape);
    if (seen) seen.count++;
    else byShape.set(shape, { count: 1, example: change });
  }

  console.log("Changes, grouped:\n");
  for (const [shape, { count }] of [...byShape.entries()].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`  ${String(count).padStart(5)}x  ${shape}`);
  }

  // A real station is a type and a two-digit number. Anything else is text
  // that was typed where a machine name belongs.
  const looksLikeStation = (name: string) => /^[a-z0-9_]+-\d{2}$/.test(name);

  const duplicated = changes.filter(
    (change) => new Set(change.after).size !== change.after.length
  );

  if (duplicated.length > 0 && !dedupe) {
    console.log(
      `\n  ${duplicated.length} row(s) end up naming the same machine twice, because two`
    );
    console.log("  spellings of it were stored. That is what the readers already produce");
    console.log("  today, so this leaves it alone. Add --dedupe to collapse them.");
    for (const change of duplicated.slice(0, 3)) {
      console.log(`      ${JSON.stringify(change.before)} -> ${JSON.stringify(change.after)}`);
    }
    if (duplicated.length > 3) console.log(`      ... and ${duplicated.length - 3} more`);
  }

  const unrecognised = changes.filter((change) => change.after.some((n) => !looksLikeStation(n)));
  if (unrecognised.length > 0) {
    console.log(`\n  ${unrecognised.length} row(s) name something that is not a machine:`);
    for (const change of unrecognised.slice(0, 5)) {
      console.log(
        `      booking ${change.bookingId ?? "(none)"}  ${JSON.stringify(change.before)}` +
          ` -> ${JSON.stringify(change.after)}`
      );
    }
    console.log("  Normalising does not make these real. They need fixing by hand,");
    console.log("  or the booking has no machine to unlock.");
  }

  const losing = changes.filter((change) => change.after.length === 0);
  if (losing.length > 0) {
    console.log(
      `\n  ${losing.length} row(s) end up with no station at all, because nothing they`
    );
    console.log("  named resolves to a real machine. Those bookings could never have");
    console.log("  unlocked anything — this makes that visible rather than fixing it.");
    for (const change of losing.slice(0, 5)) {
      console.log(`      booking ${change.bookingId ?? "(none)"}  named ${JSON.stringify(change.before)}`);
    }
    if (losing.length > 5) console.log(`      ... and ${losing.length - 5} more`);
  }

  if (!apply) {
    console.log("\nNothing was changed. Re-run with --apply to write it.\n");
    return;
  }

  console.log("\nApplying...");
  let written = 0;
  const failures: string[] = [];

  for (const change of changes) {
    const error = await write(change);
    if (error) failures.push(`${change.id}: ${error}`);
    else written++;
  }

  console.log(`  updated ${written} row(s)`);
  if (failures.length > 0) {
    console.log(`  failed  ${failures.length}:`);
    for (const failure of failures.slice(0, 10)) console.log(`     ${failure}`);
    process.exitCode = 1;
  }

  // Read back rather than trust the writes.
  const after = planChanges(await readAll());
  console.log(
    after.length === 0
      ? "  verified: every row is now in canonical form\n"
      : `  WARNING: ${after.length} row(s) still differ — re-run to see them\n`
  );
}

main().catch((error) => {
  console.error("\nFailed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
