import { NextRequest, NextResponse } from "next/server";
import { resolveAgentDownloadUrl } from "@/lib/agentDownload";
import { requireOwnerContext } from "@/lib/ownerAuth";

export const dynamic = "force-dynamic";

/**
 * GET /api/owner/stations/agent-download
 *
 * Returns a working installer URL for authenticated owners. Verifies the
 * configured link and falls back to the GitHub Releases API when /latest/download
 * 404s because no release has been published yet.
 */
export async function GET(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) return auth.response;

  const result = await resolveAgentDownloadUrl();

  if (!result.url) {
    return NextResponse.json(
      {
        url: null,
        error: result.error,
        publishHelp: result.publishHelp,
      },
      { status: 503 }
    );
  }

  return NextResponse.json({ url: result.url });
}
