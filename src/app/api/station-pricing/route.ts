import { NextRequest, NextResponse } from 'next/server';
import { requireOwnerCafeAccess, requireOwnerContext } from '@/lib/ownerAuth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;

    const { ownerId, supabase } = auth.context;
    const { searchParams } = new URL(request.url);
    const cafeId = searchParams.get('cafeId');

    if (!cafeId) {
      return NextResponse.json({ error: 'cafeId is required' }, { status: 400 });
    }

    const accessResponse = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
    if (accessResponse) return accessResponse;

    const { data, error } = await supabase
      .from('station_pricing')
      .select('*')
      .eq('cafe_id', cafeId)
      .order('station_number', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ pricing: data || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch station pricing';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/station-pricing?cafeId=...&stationName=...
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;
    const { ownerId, supabase } = auth.context;
    const { searchParams } = new URL(request.url);
    const cafeId = searchParams.get('cafeId');
    const stationName = searchParams.get('stationName');

    if (!cafeId || !stationName) {
      return NextResponse.json({ error: 'cafeId and stationName required' }, { status: 400 });
    }

    // Verify ownership
    const { data: cafe } = await supabase.from('cafes').select('id').eq('id', cafeId).eq('owner_id', ownerId).maybeSingle();
    if (!cafe) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await supabase.from('station_pricing').delete().eq('cafe_id', cafeId).eq('station_name', stationName);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete station pricing';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;

    const { ownerId, supabase } = auth.context;
    const { pricingData, applyToAll, allPricingData, powerToggleOnly } = await request.json();

    const cafeIds = new Set<string>();
    if (powerToggleOnly && pricingData?.cafe_id) {
      cafeIds.add(pricingData.cafe_id);
    } else if (applyToAll && Array.isArray(allPricingData)) {
      allPricingData.forEach((item: { cafe_id?: string }) => {
        if (item?.cafe_id) cafeIds.add(item.cafe_id);
      });
    } else if (pricingData?.cafe_id) {
      cafeIds.add(pricingData.cafe_id);
    }

    if (cafeIds.size === 0) {
      return NextResponse.json({ error: 'cafe_id is required' }, { status: 400 });
    }

    for (const cafeId of cafeIds) {
      const accessResponse = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
      if (accessResponse) return accessResponse;
    }

    // Power-only toggle: avoid upsert constraint issues by doing select→update or insert
    if (powerToggleOnly) {
      const { cafe_id, station_name, is_active } = pricingData;

      const { data: existing } = await supabase
        .from('station_pricing')
        .select('id')
        .eq('cafe_id', cafe_id)
        .eq('station_name', station_name)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await supabase
          .from('station_pricing')
          .update({ is_active })
          .eq('id', existing.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      }
      // No pricing row yet — power state tracked in-memory only (configuring pricing will persist it)

      return NextResponse.json({ success: true });
    }

    if (applyToAll && allPricingData?.length > 0) {
      const { error } = await supabase
        .from('station_pricing')
        .upsert(allPricingData, { onConflict: 'cafe_id,station_name' });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    } else {
      const { error } = await supabase
        .from('station_pricing')
        .upsert(pricingData, { onConflict: 'cafe_id,station_name' });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to save station pricing';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
