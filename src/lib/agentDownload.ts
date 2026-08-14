/**
 * Where the public PC lock installer is hosted.
 *
 * Same file for every café and every PC — credentials are exchanged via setup
 * codes, not baked into the installer.
 */

export const PC_LOCK_INSTALLER_FILE = "BookMyGame-PC-Lock-Setup.exe";
export const PC_LOCK_GITHUB_REPO = "bookmygame169/gaming-app";

export function getAgentDownloadUrl(): string | null {
  const url =
    process.env.AGENT_DOWNLOAD_URL?.trim() ||
    process.env.NEXT_PUBLIC_AGENT_DOWNLOAD_URL?.trim() ||
    null;
  return url || null;
}

async function isUrlReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Finds the real download URL from GitHub Releases API when /latest/download/
 * 404s because no release exists or the shortcut URL is stale.
 */
export async function fetchLatestGithubReleaseAsset(
  owner: string,
  repo: string,
  fileName: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "bookmygame-app",
        },
        cache: "no-store",
      }
    );

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as {
      assets?: Array<{ name: string; browser_download_url: string }>;
    };

    const asset = data.assets?.find((entry) => entry.name === fileName);
    return asset?.browser_download_url ?? null;
  } catch {
    return null;
  }
}

export type AgentDownloadResolution = {
  url: string | null;
  error?: string;
  publishHelp?: string;
};

/**
 * Resolves a working installer URL: env var first, then GitHub Releases API.
 */
export async function resolveAgentDownloadUrl(): Promise<AgentDownloadResolution> {
  const configured = getAgentDownloadUrl();
  const [owner, repo] = PC_LOCK_GITHUB_REPO.split("/");

  if (configured && (await isUrlReachable(configured))) {
    return { url: configured };
  }

  const fromApi = await fetchLatestGithubReleaseAsset(
    owner,
    repo,
    PC_LOCK_INSTALLER_FILE
  );

  if (fromApi) {
    return { url: fromApi };
  }

  const publishHelp =
    "Publish the installer on GitHub: open your repo → Actions → " +
    "\"Build PC Lock Installer\" → Run workflow → wait ~5 minutes → try download again.";

  if (configured) {
    return {
      url: null,
      error:
        "The installer file is not on GitHub yet (the download link returns 404).",
      publishHelp,
    };
  }

  return {
    url: null,
    error:
      "No installer is published yet and no download URL is configured on the server.",
    publishHelp,
  };
}
