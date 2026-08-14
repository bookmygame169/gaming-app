/**
 * Where the public PC lock installer is hosted.
 *
 * Same file for every café and every PC — credentials are exchanged via setup
 * codes, not baked into the installer.
 */
export function getAgentDownloadUrl(): string | null {
  const url =
    process.env.AGENT_DOWNLOAD_URL?.trim() ||
    process.env.NEXT_PUBLIC_AGENT_DOWNLOAD_URL?.trim() ||
    null;
  return url || null;
}
