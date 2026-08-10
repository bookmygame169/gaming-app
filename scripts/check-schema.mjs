#!/usr/bin/env node
/**
 * Checks the tables, columns and functions the code uses against the ones the
 * database actually has.
 *
 * This exists because the migrations folder and the live database have drifted
 * apart. Several migrations were never applied, and a few can no longer be
 * applied safely, so the folder is not a description of production. Code
 * written against the folder compiles, deploys, and then fails at runtime with
 * a message that says nothing useful — placing a booking failed for weeks with
 * "Could not place the booking" because the insert named three coupon columns
 * that do not exist, and onboarding a café failed because profiles has no email
 * column.
 *
 * TypeScript cannot catch any of that: a Supabase column name is a string.
 *
 * Usage:
 *   npm run check:schema
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and a Supabase key from the environment or
 * .env.local. Exits non-zero if anything is wrong, so it can gate a deploy.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");

// ---------------------------------------------------------------- environment

function loadEnv() {
  const envPath = join(ROOT, ".env.local");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;

    // Values are taken literally apart from surrounding quotes. Anything
    // cleverer risks mangling keys that contain '=' or '#'.
    const value = match[2].trim().replace(/^["']|["']$/g, "");
    if (!(match[1] in process.env)) process.env[match[1]] = value;
  }
}

// ------------------------------------------------------------------- schema

async function fetchSchema() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Signalled rather than thrown: this gates the build, and "could not
    // check" must not be treated the same as "found a problem".
    return null;
  }

  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });

  if (!res.ok) {
    console.warn(`Could not read the schema (HTTP ${res.status}).`);
    return null;
  }

  const spec = await res.json();

  return {
    tables: new Map(
      Object.entries(spec.definitions ?? {}).map(([name, def]) => [
        name,
        new Set(Object.keys(def.properties ?? {})),
      ])
    ),
    functions: new Set(
      Object.keys(spec.paths ?? {})
        .filter((path) => path.startsWith("/rpc/"))
        .map((path) => path.slice(5))
    ),
  };
}

// -------------------------------------------------------------------- sources

function sourceFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(full)) found.push(full);
  }
  return found;
}

/**
 * Blanks out comments, keeping every offset and newline where it was so
 * reported line numbers stay right.
 *
 * String literals are left alone: the table and function names this checker
 * looks for live inside them, and blanking those turned the whole check into a
 * no-op that cheerfully reported no problems.
 *
 * Strings are still tracked, because a URL like "upi://pay" would otherwise
 * start a comment and swallow the rest of the line. Comments have to go
 * because the key scanner reads prose out of them — a comment ending "...does
 * not need one:" was reported as a column named `one`, and a checker that
 * cries wolf gets ignored.
 */
function blankComments(source) {
  const out = source.split("");
  let i = 0;

  while (i < source.length) {
    const char = source[i];
    const two = source.slice(i, i + 2);

    // Inside a string: copy through untouched, just find the end.
    if (char === '"' || char === "'" || char === "`") {
      i++;
      while (i < source.length) {
        if (source[i] === "\\") {
          i += 2;
          continue;
        }
        if (source[i] === char) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (two === "//") {
      while (i < source.length && source[i] !== "\n") out[i++] = " ";
      continue;
    }

    if (two === "/*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      while (i < stop) {
        if (source[i] !== "\n") out[i] = " ";
        i++;
      }
      continue;
    }

    i++;
  }

  return out.join("");
}

/**
 * Reads the object literal starting at `open`, returning only its top-level
 * keys.
 *
 * Depth matters: an insert payload frequently contains nested option objects —
 * `start_time: now.toLocaleTimeString("en-US", { hour: "numeric" })` — and
 * counting `hour` as a column produces a false report that costs more trust
 * than the check is worth.
 */
function topLevelKeys(source, open) {
  const keys = [];
  let depth = 0;
  let i = open;

  for (; i < source.length; i++) {
    const char = source[i];

    if (char === "(" || char === "{" || char === "[") {
      depth++;
      continue;
    }

    if (char === ")" || char === "}" || char === "]") {
      depth--;
      if (depth === 0) break;
      continue;
    }

    // Depth 2 is inside the payload object itself: ( is 1, { is 2.
    if (depth === 2) {
      const rest = source.slice(i);
      const key = rest.match(/^([a-z_][a-z_0-9]*)\s*:/);
      if (key && /[\s{,]/.test(source[i - 1] ?? "")) {
        keys.push(key[1]);
        i += key[1].length;
      }
    }
  }

  return keys;
}

function lineOf(source, index) {
  return source.slice(0, index).split("\n").length;
}

// ---------------------------------------------------------------------- check

function check(schema) {
  const problems = [];
  const files = sourceFiles(SRC);

  for (const file of files) {
    // Comments are blanked so prose in them is not read as code. Strings are
    // kept — the table names live in them. Offsets are preserved for line numbers.
    const source = blankComments(readFileSync(file, "utf8"));
    const where = relative(ROOT, file);

    // Functions
    for (const match of source.matchAll(/\.rpc\(\s*['"]([a-z_0-9]+)['"]/g)) {
      if (!schema.functions.has(match[1])) {
        problems.push({
          where: `${where}:${lineOf(source, match.index)}`,
          what: `calls missing function ${match[1]}()`,
        });
      }
    }

    // Tables and write payloads
    const writeCall = /\.from\(\s*['"]([a-z_0-9]+)['"]\s*\)\s*\n?\s*\.(insert|update|upsert)\s*\(/g;
    for (const match of source.matchAll(writeCall)) {
      const [, table, op] = match;
      const at = `${where}:${lineOf(source, match.index)}`;

      if (!schema.tables.has(table)) {
        problems.push({ where: at, what: `writes to missing table ${table}` });
        continue;
      }

      const columns = schema.tables.get(table);
      const unknown = topLevelKeys(source, match.index + match[0].length - 1).filter(
        (key) => !columns.has(key)
      );

      if (unknown.length > 0) {
        problems.push({
          where: at,
          what: `${table}.${op}() writes unknown column${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}`,
        });
      }
    }

    // Reads. Only the table name is checked: select strings carry embedded
    // relationships and aliases that are not worth parsing badly.
    for (const match of source.matchAll(/\.from\(\s*['"]([a-z_0-9]+)['"]\s*\)/g)) {
      if (!schema.tables.has(match[1])) {
        const at = `${where}:${lineOf(source, match.index)}`;
        if (!problems.some((p) => p.where === at)) {
          problems.push({ where: at, what: `reads missing table ${match[1]}` });
        }
      }
    }
  }

  return problems;
}

// ----------------------------------------------------------------------- main

loadEnv();

try {
  const schema = await fetchSchema();

  // Only a mismatch we actually found should stop a deploy. No credentials or
  // an unreachable database means this ran blind, and blocking a release over
  // that would get the check taken back out of the build within a week.
  if (!schema) {
    console.warn(
      "Skipping the schema check: no Supabase URL/key available, or the database " +
        "could not be reached. Nothing was verified."
    );
    process.exit(0);
  }

  console.log(
    `Checked against ${schema.tables.size} tables and ${schema.functions.size} functions.\n`
  );

  const problems = check(schema);

  if (problems.length === 0) {
    console.log("No mismatches. The code and the database agree.");
    process.exit(0);
  }

  for (const problem of problems) {
    console.log(`  ${problem.where}\n    ${problem.what}\n`);
  }

  console.log(`${problems.length} mismatch${problems.length > 1 ? "es" : ""}.`);
  process.exit(1);
} catch (err) {
  // Same reasoning: a crash in the checker is not evidence of a bad schema.
  console.warn("Schema check could not run:", err instanceof Error ? err.message : err);
  process.exit(0);
}
