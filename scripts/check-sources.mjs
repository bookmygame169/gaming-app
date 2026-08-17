#!/usr/bin/env node
/**
 * Catches source files that were damaged rather than written.
 *
 * This exists because of a specific failure. A block of C# containing Windows
 * paths was written through a shell heredoc that processed its backslashes
 * before the file was saved: `\t` became a tab character, `\r` a carriage
 * return, `\a` a bell, `\b` a backspace, and `'\\'` collapsed to `'\'` — an
 * unterminated character literal. Six syntax errors, none of them visible when
 * reading the file back, since a bell renders as nothing.
 *
 * A compiler catches all of this. The point of this script is that it needs no
 * toolchain, runs in well under a second, and can therefore run before a commit
 * and as the first thing in CI, rather than at the end of a build.
 *
 * Two checks:
 *   1. Control characters that never belong in source (bell, backspace,
 *      vertical tab, form feed, and lone carriage returns in an LF file).
 *   2. String and character literals left open at the end of a line, which is
 *      what a mangled escape produces.
 *
 * Usage:
 *   npm run check:sources
 *
 * Exits non-zero if anything is wrong, so it can gate a push.
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const EXTENSIONS = [".cs", ".ts", ".tsx", ".mjs", ".ps1", ".yml", ".iss", ".kt"];

// Files whose contents are deliberately not source we control.
const SKIP = [/(^|\/)node_modules\//, /(^|\/)\.next\//];

function trackedFiles() {
  const out = execFileSync("git", ["ls-files"], { encoding: "utf8" });
  return out
    .split("\n")
    .filter(Boolean)
    .filter((file) => EXTENSIONS.some((ext) => file.endsWith(ext)))
    .filter((file) => !SKIP.some((pattern) => pattern.test(file)));
}

/** Control characters that are never meant to be in a source file. */
function findControlCharacters(bytes) {
  const found = [];
  let line = 1;

  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];

    if (byte === 0x0a) {
      line++;
      continue;
    }

    // A carriage return is fine as part of CRLF and suspect on its own.
    if (byte === 0x0d) {
      if (bytes[i + 1] !== 0x0a) {
        found.push({ line, what: "a lone carriage return (\\r)" });
      }
      continue;
    }

    const names = { 0x07: "a bell (\\a)", 0x08: "a backspace (\\b)", 0x0b: "a vertical tab (\\v)", 0x0c: "a form feed (\\f)" };
    if (names[byte]) {
      found.push({ line, what: names[byte] });
    }
  }

  return found;
}

/**
 * Literals left open at the end of a line.
 *
 * Walks the file tracking whether it is inside a comment, a verbatim string
 * (@"..." in C#, where a backslash means nothing), a template literal, or an
 * ordinary quoted literal. Only the last of those is required to close on the
 * line it opened, so only that is reported.
 */
function findUnterminatedLiterals(text, file) {
  const isCSharp = file.endsWith(".cs");
  const problems = [];
  let i = 0;
  let line = 1;
  let state = null;

  while (i < text.length) {
    const c = text[i];

    if (c === "\n") {
      if (state === "string" || state === "char") {
        problems.push({ line, what: `an unterminated ${state} literal` });
        state = null;
      }
      line++;
      i++;
      continue;
    }

    if (state === null) {
      if (text.startsWith("//", i)) {
        while (i < text.length && text[i] !== "\n") i++;
        continue;
      }
      if (text.startsWith("/*", i)) {
        const end = text.indexOf("*/", i + 2);
        const stop = end < 0 ? text.length : end + 2;
        for (let j = i; j < stop; j++) if (text[j] === "\n") line++;
        i = stop;
        continue;
      }
      if (isCSharp && text.startsWith('@"', i)) {
        state = "verbatim";
        i += 2;
        continue;
      }
      if (c === '"') { state = "string"; i++; continue; }
      if (c === "'") { state = "char"; i++; continue; }
      if (c === "`") { state = "template"; i++; continue; }
      i++;
      continue;
    }

    if (state === "verbatim") {
      if (c === '"') {
        // "" inside a verbatim string is an escaped quote, not the end.
        if (text[i + 1] === '"') { i += 2; continue; }
        state = null;
      }
      i++;
      continue;
    }

    if (state === "template") {
      if (c === "\\") { i += 2; continue; }
      if (c === "`") state = null;
      i++;
      continue;
    }

    if (c === "\\") { i += 2; continue; }
    if ((c === '"' && state === "string") || (c === "'" && state === "char")) state = null;
    i++;
  }

  return problems;
}

const failures = [];

for (const file of trackedFiles()) {
  let bytes;
  try {
    bytes = readFileSync(file);
  } catch {
    continue;
  }

  const text = bytes.toString("utf8");

  for (const hit of findControlCharacters(bytes)) {
    failures.push(`${file}:${hit.line}  contains ${hit.what}`);
  }

  // C# only, deliberately.
  //
  // This walker is not a parser. In TypeScript it cannot tell a string from an
  // apostrophe in JSX text ("don't") or a quote inside a regex literal, and it
  // reported thirty of those as broken on the first run. Getting that right
  // needs a real parser, and TypeScript already has one — tsc runs on every
  // push in the same workflow and will not miss an unterminated string.
  //
  // C# has no equivalent ambiguity here and no cheap parser to lean on, which
  // is exactly where the gap was.
  if (file.endsWith(".cs")) {
    for (const hit of findUnterminatedLiterals(text, file)) {
      failures.push(`${file}:${hit.line}  has ${hit.what}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Damaged source files:\n");
  for (const failure of failures) console.error("  " + failure);
  console.error(
    "\nThis usually means text was written through a shell or a script that " +
      "processed its escape sequences. Rewrite the affected lines directly."
  );
  process.exit(1);
}

console.log("Sources are clean: no stray control characters, no unterminated literals.");
