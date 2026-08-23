import { NextRequest, NextResponse } from "next/server";
import {
  getOwnedCafeIdForRecord,
  requireOwnerCafeAccess,
  requireOwnerContext,
} from "@/lib/ownerAuth";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) {
    return auth.response;
  }

  const { ownerId, supabase } = auth.context;
  const cafeId = request.nextUrl.searchParams.get('cafeId');

  if (!cafeId) {
    return NextResponse.json({ error: "cafeId required" }, { status: 400 });
  }

  const accessResponse = await requireOwnerCafeAccess(
    supabase,
    ownerId,
    cafeId
  );
  if (accessResponse) {
    return accessResponse;
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*, membership_plans(name, console_type, plan_type, hours, validity_days)')
    .eq('cafe_id', cafeId)
    .order('purchase_date', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ subscriptions: data || [] });
}

// POST /api/owner/subscriptions — create subscription
export async function POST(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) {
    return auth.response;
  }

  const { ownerId, supabase } = auth.context;
  const body = await request.json();

  if (!body?.cafe_id) {
    return NextResponse.json({ error: "cafe_id required" }, { status: 400 });
  }

  const accessResponse = await requireOwnerCafeAccess(
    supabase,
    ownerId,
    body.cafe_id
  );
  if (accessResponse) {
    return accessResponse;
  }

  const { error } = await supabase.from('subscriptions').insert(body);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// PATCH /api/owner/subscriptions — update subscription state
export async function PATCH(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) {
    return auth.response;
  }

  const { ownerId, supabase } = auth.context;
  const { id, updates, usageEntry } = await request.json();

  if (!id || !updates) {
    return NextResponse.json({ error: "id and updates required" }, { status: 400 });
  }

  const ownedCafeId = await getOwnedCafeIdForRecord(
    supabase,
    "subscriptions",
    id,
    ownerId
  );
  if (!ownedCafeId) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  // Named rather than passed straight through.
  //
  // Ownership is checked above, so this is the owner's own record either way -
  // but "whatever the browser sent" as an UPDATE lets a mistyped or tampered
  // field move a membership to another café or rewrite the plan it was sold
  // against. Every caller only ever sets the fields below; anything else is a
  // bug on its way to the database.
  const allowed = new Set([
    'customer_name',
    'customer_phone',
    'hours_remaining',
    'timer_active',
    'timer_start_time',
    'assigned_console_station',
    'status',
    'amount_paid',
    'payment_mode',
    'expiry_date',
    'updated_at',
  ]);

  const safe: Record<string, unknown> = {};
  const refused: string[] = [];

  for (const [column, value] of Object.entries(updates as Record<string, unknown>)) {
    if (allowed.has(column)) {
      safe[column] = value;
    } else {
      refused.push(column);
    }
  }

  if (refused.length > 0) {
    console.warn(`Refused to update subscription columns: ${refused.join(', ')}`);
  }

  if (Object.keys(safe).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from('subscriptions')
    .update(safe)
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (usageEntry) {
    const { error: historyError } = await supabase
      .from('subscription_usage_history')
      .insert({
        ...usageEntry,
        subscription_id: id,
      });

    if (historyError) {
      // Subscription was updated but usage log failed — surface a clear partial-state error
      console.error('[subscriptions PATCH] Usage log insert failed after subscription update:', historyError.message, '| subscription_id:', id);
      return NextResponse.json({
        error: `Subscription updated but usage history could not be recorded: ${historyError.message}`,
        partialSuccess: true,
      }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/owner/subscriptions?id=...
export async function DELETE(request: NextRequest) {
  const auth = await requireOwnerContext(request);
  if (auth.response) {
    return auth.response;
  }

  const { ownerId, supabase } = auth.context;
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const ownedCafeId = await getOwnedCafeIdForRecord(
    supabase,
    "subscriptions",
    id,
    ownerId
  );
  if (!ownedCafeId) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  const { error } = await supabase.from('subscriptions').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
