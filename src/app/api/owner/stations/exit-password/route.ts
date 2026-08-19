import { NextRequest, NextResponse } from "next/server";
import { requireOwnerCafeAccess, requireOwnerContext } from "@/lib/ownerAuth";
import { exitPasswordProblem, hashExitPassword } from "@/lib/stationExitPassword";

export const dynamic = "force-dynamic";

const MISSING_COLUMN =
  "This café's database does not have the exit password column yet. " +
  "Run migration 20260819000000_add_station_exit_password.sql, then try again.";

/**
 * GET — whether a password is set. Never returns the hash.
 *
 * The dashboard only needs to know whether to say "Set a password" or "Change
 * it", and sending the hash to a browser would put it somewhere it has no
 * reason to be.
 */
export async function GET(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) return auth.response;

  const { ownerId, supabase } = auth.context;
  const cafeId = request.nextUrl.searchParams.get("cafeId");
  if (!cafeId) return NextResponse.json({ error: "cafeId is required" }, { status: 400 });

  const denied = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
  if (denied) return denied;

  const { data, error } = await supabase
    .from("cafes")
    .select("station_exit_password_hash")
    .eq("id", cafeId)
    .maybeSingle();

  if (error) {
    if (/station_exit_password_hash/i.test(error.message)) {
      return NextResponse.json({ isSet: false, migrationNeeded: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ isSet: Boolean(data?.station_exit_password_hash) });
}

/**
 * POST — set or replace the password for every station at this café.
 *
 * Hashed here rather than in the browser. The plaintext exists for the length
 * of this request and is never written down: not in the database, not in a log,
 * and not in the response.
 */
export async function POST(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) return auth.response;

  const { ownerId, supabase } = auth.context;

  let body: { cafeId?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const cafeId = typeof body.cafeId === "string" ? body.cafeId : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!cafeId) return NextResponse.json({ error: "cafeId is required" }, { status: 400 });

  const denied = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
  if (denied) return denied;

  const problem = exitPasswordProblem(password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const { error } = await supabase
    .from("cafes")
    .update({ station_exit_password_hash: hashExitPassword(password) })
    .eq("id", cafeId);

  if (error) {
    if (/station_exit_password_hash/i.test(error.message)) {
      return NextResponse.json({ error: MISSING_COLUMN }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    // Said plainly, because an owner who changes this and walks away expecting
    // it to have taken effect would be wrong.
    note: "Each station picks this up the next time its agent starts.",
  });
}

/** DELETE — remove it. The chord then does nothing at all. */
export async function DELETE(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) return auth.response;

  const { ownerId, supabase } = auth.context;
  const cafeId = request.nextUrl.searchParams.get("cafeId");
  if (!cafeId) return NextResponse.json({ error: "cafeId is required" }, { status: 400 });

  const denied = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
  if (denied) return denied;

  const { error } = await supabase
    .from("cafes")
    .update({ station_exit_password_hash: null })
    .eq("id", cafeId);

  if (error) {
    if (/station_exit_password_hash/i.test(error.message)) {
      return NextResponse.json({ error: MISSING_COLUMN }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
