import { PC_LOCK_GITHUB_REPO } from "@/lib/agentDownload";

/**
 * The version file every café PC already checks for itself.
 *
 * A fixed tag rather than /latest, so the URL never changes as versions come
 * and go - the same one update-agent.ps1 reads on the machines. The dashboard
 * asking a different question than the PCs would be a good way to report a PC
 * as out of date forever.
 */
const VERSION_URL =
  `https://github.com/${PC_LOCK_GITHUB_REPO}/releases/download/pc-lock-latest/version.txt`;

/**
 * How long a fetched version is trusted.
 *
 * Ten minutes. A release lands a few times a week at most, and the dashboard
 * polls station status every few seconds - without this, watching the stations
 * page for a minute would be a dozen requests to GitHub for a string that
 * changes twice a week.
 */
const CACHE_MS = 10 * 60 * 1000;

let cached: { version: string | null; at: number } = { version: null, at: 0 };

export async function fetchLatestAgentVersion(): Promise<string | null> {
  const now = Date.now();

  if (cached.version && now - cached.at < CACHE_MS) {
    return cached.version;
  }

  try {
    const res = await fetch(VERSION_URL, {
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return cached.version;

    const text = (await res.text()).trim();

    // Shaped like a version or ignored. A 404 page served as 200, or an outage
    // notice, must not become "every PC in the café is out of date".
    if (!/^\d+\.\d+\.\d+$/.test(text)) return cached.version;

    cached = { version: text, at: now };
    return text;
  } catch {
    // Stale beats wrong: the last known good answer, or nothing at all.
    return cached.version;
  }
}

/**
 * Whether the first version is older than the second.
 *
 * Compared piece by piece as numbers, because as text "1.1.9" sorts after
 * "1.1.80" and a café would be told its newest PC needed updating.
 */
export function isOlderVersion(installed: string | null, published: string | null): boolean {
  if (!installed || !published) return false;

  const left = installed.trim().split(".").map((part) => Number(part) || 0);
  const right = published.trim().split(".").map((part) => Number(part) || 0);

  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const a = left[i] ?? 0;
    const b = right[i] ?? 0;
    if (a !== b) return a < b;
  }

  return false;
}
