import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/userAuth";

export const dynamic = "force-dynamic";

/**
 * PUT /api/profile — the signed-in customer saves their own details.
 *
 * Goes through the server because the cafés' ISP blocks Supabase from the
 * browser, and because this is where the phone number is set: loyalty points
 * and memberships are both matched on it, so a save that quietly fails looks
 * to the customer like their points disappeared.
 */
export async function PUT(request: NextRequest) {
  try {
    const { userId, response: authResponse } = await requireUser(request);
    if (authResponse) return authResponse;

    const body = await request.json().catch(() => ({}));

    const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
    const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const dateOfBirth = typeof body.dateOfBirth === "string" ? body.dateOfBirth.trim() : "";

    if (phone && phone.replace(/\D/g, "").length < 10) {
      return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
    }

    if (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
      return NextResponse.json({ error: "Enter a valid date of birth." }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // id comes from the verified token, never from the body, so one customer
    // cannot overwrite another's profile.
    const { error } = await supabase.from("profiles").upsert({
      id: userId,
      first_name: firstName || null,
      last_name: lastName || null,
      phone: phone || null,
      date_of_birth: dateOfBirth || null,
    });

    if (error) {
      console.error("Profile save failed:", error.message);
      return NextResponse.json({ error: "Could not save your details." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Unexpected error saving profile:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
