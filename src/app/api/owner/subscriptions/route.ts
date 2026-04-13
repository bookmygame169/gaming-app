import { NextRequest, NextResponse } from "next/server";
import {
  getOwnedCafeIdForRecord,
  requireOwnerCafeAccess,
  requireOwnerContext,
} from "@/lib/ownerAuth";

export const dynamic = 'force-dynamic';

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

  const { error: updateError } = await supabase
    .from('subscriptions')
    .update(updates)
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
