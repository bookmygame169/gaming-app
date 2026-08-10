import { NextRequest, NextResponse } from "next/server";
import { requireAdminContext, getSupabaseAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function uniqueSlug(supabase: ReturnType<typeof getSupabaseAdmin>, base: string): Promise<string> {
  let slug = base;
  let attempt = 0;
  while (true) {
    const { data } = await supabase.from("cafes").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
    attempt++;
    slug = `${base}-${attempt}`;
  }
}

export async function POST(request: NextRequest) {
  const { context, response } = await requireAdminContext(request);
  if (response) return response;
  const supabase = context.supabase;

  try {
    const body = await request.json();
    const {
      name,
      address,
      phone,
      email,
      owner_email,
      price_starts_from,
      hourly_price,
      ps5_count = 0,
      ps4_count = 0,
      xbox_count = 0,
      pc_count = 0,
      vr_count = 0,
      pool_count = 0,
      snooker_count = 0,
      arcade_count = 0,
      steering_wheel_count = 0,
      racing_sim_count = 0,
    } = body;

    if (!name?.trim() || !address?.trim()) {
      return NextResponse.json({ error: "Café name and address are required" }, { status: 400 });
    }

    if (!owner_email?.trim()) {
      return NextResponse.json({ error: "Owner Gmail is required to link the owner dashboard" }, { status: 400 });
    }

    const ownerEmailLower = owner_email.trim().toLowerCase();

    // ── Resolve owner_id ──────────────────────────────────────────────────────
    //
    // This used to look up a profile by email and, failing that, insert a
    // "placeholder" one. Neither could ever work: profiles has no email column
    // and no name column, and profiles.id is a foreign key to auth.users, so a
    // profile cannot exist without a real account behind it. Onboarding any
    // café through this route failed on that insert before the café was
    // created, and the owner_allowed_emails row that actually governs owner
    // login was never written.
    //
    // The email lives on the auth user, so that is where it is looked up. The
    // account is created if it is new — the owner signs in with Google against
    // the same address later, and Supabase matches them by email.
    let ownerId: string | null = null;

    const { data: existingUsers, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) {
      console.error("Could not list auth users:", listErr.message);
      return NextResponse.json({ error: "Could not look up the owner account" }, { status: 500 });
    }

    const existingUser = existingUsers?.users?.find(
      (user) => user.email?.toLowerCase() === ownerEmailLower
    );

    if (existingUser) {
      ownerId = existingUser.id;
    } else {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: ownerEmailLower,
        // Confirmed because this address is being vouched for by an admin, and
        // the owner will arrive through Google sign-in rather than a password.
        email_confirm: true,
      });

      if (createErr || !created?.user) {
        console.error("Failed to create owner account:", createErr);
        return NextResponse.json(
          { error: "Failed to create the owner account: " + (createErr?.message ?? "unknown error") },
          { status: 500 }
        );
      }

      ownerId = created.user.id;
    }

    // requireOwnerContext reads the role off this row, so the café is not
    // manageable until it exists. Upserted because a trigger may have created
    // it already when the auth user appeared.
    const { error: profileErr } = await supabase.from("profiles").upsert(
      {
        id: ownerId,
        first_name: ownerEmailLower.split("@")[0],
        role: "owner",
      },
      { onConflict: "id" }
    );

    if (profileErr) {
      console.error("Failed to save owner profile:", profileErr);
      return NextResponse.json(
        { error: "Failed to set up the owner profile: " + profileErr.message },
        { status: 500 }
      );
    }

    // ── Generate unique slug ──────────────────────────────────────────────────
    const slug = await uniqueSlug(supabase, toSlug(name.trim()));

    // ── Insert café ───────────────────────────────────────────────────────────
    const { data: cafe, error: cafeErr } = await supabase
      .from("cafes")
      .insert({
        name: name.trim(),
        address: address.trim(),
        slug,
        owner_id: ownerId,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        price_starts_from: price_starts_from ? Number(price_starts_from) : null,
        hourly_price: hourly_price ? Number(hourly_price) : null,
        ps5_count: Number(ps5_count) || 0,
        ps4_count: Number(ps4_count) || 0,
        xbox_count: Number(xbox_count) || 0,
        pc_count: Number(pc_count) || 0,
        vr_count: Number(vr_count) || 0,
        pool_count: Number(pool_count) || 0,
        snooker_count: Number(snooker_count) || 0,
        arcade_count: Number(arcade_count) || 0,
        steering_wheel_count: Number(steering_wheel_count) || 0,
        racing_sim_count: Number(racing_sim_count) || 0,
        is_active: false,
        is_featured: false,
      })
      .select("id, name, slug")
      .single();

    if (cafeErr || !cafe) {
      console.error("Failed to create café:", cafeErr);
      return NextResponse.json({ error: "Failed to create café: " + cafeErr?.message }, { status: 500 });
    }

    // ── Add owner email to allowed list ───────────────────────────────────────
    // Upsert in case the email is already in the table from a previous attempt
    const { error: emailErr } = await supabase
      .from("owner_allowed_emails")
      .upsert(
        { email: ownerEmailLower, cafe_id: cafe.id, active: true },
        { onConflict: "email" }
      );

    if (emailErr) {
      console.error("Warning: could not add to owner_allowed_emails:", emailErr);
      // Don't fail the whole request — café was created, email can be added manually
    }

    return NextResponse.json({ success: true, cafe }, { status: 201 });
  } catch (err) {
    console.error("Create café error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

/**
 * Fields an admin may change on a café.
 *
 * Allow-listed rather than passed through, so a stray key in the request body
 * cannot reach the update. owner_id is deliberately absent: reassigning a café
 * to a different owner is not an edit, it is a handover, and it has to go
 * through owner_allowed_emails to be usable.
 */
const ALLOWED_CAFE_FIELDS = new Set([
  "name",
  "slug",
  "address",
  "city",
  "phone",
  "email",
  "description",
  "opening_hours",
  "peak_hours",
  "popular_games",
  "offers",
  "price_starts_from",
  "hourly_price",
  "google_maps_url",
  "instagram_url",
  "cover_url",
  "is_active",
  "is_featured",
  "monitor_details",
  "processor_details",
  "gpu_details",
  "ram_details",
  "accessories_details",
  "show_tech_specs",
  "ps5_count",
  "ps4_count",
  "xbox_count",
  "pc_count",
  "pool_count",
  "snooker_count",
  "arcade_count",
  "vr_count",
  "steering_wheel_count",
  "racing_sim_count",
]);

/**
 * PUT /api/admin/cafes — edit a café.
 *
 * body: { cafeId, updates }
 *
 * The admin panel edited cafés with a direct Supabase update from the browser,
 * which the cafés' ISP blocks — so saving café details failed from the one
 * network an admin is most likely to be sitting on.
 */
export async function PUT(request: NextRequest) {
  const { context, response } = await requireAdminContext(request);
  if (response) return response;

  try {
    const supabase = context.supabase;
    const { cafeId, updates } = await request.json().catch(() => ({}));

    if (!cafeId) {
      return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
    }

    const safeUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates || {})) {
      if (ALLOWED_CAFE_FIELDS.has(key)) safeUpdates[key] = value;
    }

    if (Object.keys(safeUpdates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("cafes")
      .update(safeUpdates)
      .eq("id", cafeId)
      .select()
      .single();

    if (error) {
      console.error("Admin café update failed:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, cafe: data });
  } catch (err) {
    console.error("Update café error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
