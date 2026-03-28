import { NextRequest, NextResponse } from 'next/server';
import { requireOwnerContext } from '@/lib/ownerAuth';

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
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;

    const { supabase } = auth.context;
    const { pricingData, applyToAll, allPricingData, powerToggleOnly } = await request.json();

    // Power-only toggle: avoid upsert constraint issues by doing select→update or insert
    if (powerToggleOnly) {
      const { cafe_id, station_name, station_type, station_number, is_active } = pricingData;

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
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
