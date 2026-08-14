import { NextRequest, NextResponse } from "next/server";
import { getAgentDownloadUrl } from "@/lib/agentDownload";
import { requireOwnerContext } from "@/lib/ownerAuth";

export const dynamic = "force-dynamic";

/**
 * GET /api/owner/stations/agent-download
 *
 * Returns the installer URL for authenticated owners. Keeps the download link
 * behind owner auth so we can swap hosting without exposing it on a public page.
 */
export async function GET(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) return auth.response;

  const url = getAgentDownloadUrl();

  if (!url) {
    return NextResponse.json(
      {
        url: null,
        error:
          "No installer URL is configured yet. Set AGENT_DOWNLOAD_URL or " +
          "NEXT_PUBLIC_AGENT_DOWNLOAD_URL on the server, then redeploy.",
      },
      { status: 503 }
    );
  }

  return NextResponse.json({ url });
}
