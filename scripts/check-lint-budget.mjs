#!/usr/bin/env node
/**
 * Fails when the lint debt grows. Does not demand it be paid off today.
 *
 * ESLint reported 112 errors here and gated nothing, so it was noise nobody
 * read — and a real crash was sitting in it: RefreshCw used without an import,
 * in a file carrying @ts-nocheck, so neither the compiler nor a human was
 * going to catch it.
 *
 * Turning the rules on as a hard failure was not an option either: 79 errors
 * remain, most of them `any`, and a red tick on every push teaches everyone to
 * ignore red ticks.
 *
 * So this is a ratchet. The current count is written down, CI fails only if a
 * change makes it worse, and lowering the number is a one-line commit whenever
 * somebody cleans a file up. New code is held to a standard the old code is
 * not yet, which is the only version of this that survives contact with a
 * working product.
 *
 * Usage:
 *   npm run check:lint
 *   npm run check:lint -- --update   # after genuinely fixing something
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const BUDGET_FILE = new URL("./lint-budget.json", import.meta.url);

function currentCounts() {
  let raw = "";
  try {
    raw = execFileSync("npx", ["eslint", "--format", "json", "."], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    // ESLint exits non-zero when it finds errors, which is the normal case
    // here. The report is still on stdout.
    raw = error.stdout ?? "";
  }

  if (!raw.trim()) {
    console.error("ESLint produced no report. Not treating that as a pass.");
    process.exit(1);
  }

  let errors = 0;
  let warnings = 0;

  for (const file of JSON.parse(raw)) {
    for (const message of file.messages) {
      if (message.severity === 2) errors++;
      else warnings++;
    }
  }

  return { errors, warnings };
}

const { errors, warnings } = currentCounts();

if (process.argv.includes("--update")) {
  writeFileSync(BUDGET_FILE, `${JSON.stringify({ errors, warnings }, null, 2)}\n`);
  console.log(`Budget updated: ${errors} errors, ${warnings} warnings.`);
  process.exit(0);
}

if (!existsSync(BUDGET_FILE)) {
  console.error("No lint-budget.json. Run with --update to write one.");
  process.exit(1);
}

const budget = JSON.parse(readFileSync(BUDGET_FILE, "utf8"));

console.log(`ESLint: ${errors} errors (budget ${budget.errors}), ${warnings} warnings (budget ${budget.warnings}).`);

if (errors > budget.errors || warnings > budget.warnings) {
  console.error("\nThis change adds lint problems.");
  console.error("Fix them, or if they are genuinely acceptable, run:");
  console.error("  npm run check:lint -- --update");
  process.exit(1);
}

if (errors < budget.errors || warnings < budget.warnings) {
  console.log("\nBelow budget — worth locking in:");
  console.log("  npm run check:lint -- --update");
}
