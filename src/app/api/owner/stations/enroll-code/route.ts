import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { requireOwnerCafeAccess, requireOwnerContext } from "@/lib/ownerAuth";

export const dynamic = "force-dynamic";

/**
 * Characters used in pairing codes.
 *
 * No O/0 or I/1: the code is read off a screen and typed on a machine that may
 * have nothing but a keyboard, and a misread character is a support call.
 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    // randomInt, not Math.random: this is a credential, briefly.
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  // Grouped for readability when typing: ABCD-2345
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/**
 * POST /api/owner/stations/enroll-code
 *
 * Creates a single-use code that a freshly installed agent exchanges for its
 * settings.
 *
 * Body: { cafeId, stationName }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;

    const { ownerId, supabase } = auth.context;
    const body = await request.json();

    const cafeId = String(body?.cafeId || "");
    const stationName = String(body?.stationName || "").trim().toLowerCase();

    if (!cafeId || !stationName) {
      return NextResponse.json(
        { error: "cafeId and stationName are required" },
        { status: 400 }
      );
    }

    const accessResponse = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
    if (accessResponse) return accessResponse;

    const code = generateCode();

    const { data, error } = await supabase
      .from("station_enrollments")
      .insert({
        cafe_id: cafeId,
        station_name: stationName,
        code,
        created_by: ownerId,
      })
      .select("code, station_name, expires_at")
      .single();

    if (error) {
      console.error("Failed to create enrollment code:", error.message);
      return NextResponse.json(
        {
          error:
            "Could not create a setup code. If this is the first time, the " +
            "station_enrollments table may not exist yet — run migration " +
            "20260806000002_add_station_enrollments.sql.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      code: data.code,
      stationName: data.station_name,
      expiresAt: data.expires_at,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create setup code";
    console.error("Enrollment code error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
