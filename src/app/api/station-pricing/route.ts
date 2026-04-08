import { NextRequest, NextResponse } from 'next/server';
import { requireOwnerCafeAccess, requireOwnerContext } from '@/lib/ownerAuth';
import { dedupeStationPricingRows, formatStationTypeLabel, normaliseStationName } from '@/lib/stationNames';

type StationPricingPayload = Record<string, unknown> & {
  cafe_id?: string;
  station_name?: string;
  station_type?: string;
  station_number?: number;
};

function normalizePricingRow(row: StationPricingPayload): StationPricingPayload {
  const stationName = normaliseStationName(
    typeof row.station_name === 'string' ? row.station_name : '',
    typeof row.station_type === 'string' ? row.station_type : '',
    typeof row.station_number === 'number' ? row.station_number : null
  );
  const stationNumberMatch = stationName.match(/-(\d+)$/);
  const stationNumber = typeof row.station_number === 'number'
    ? row.station_number
    : (stationNumberMatch ? Number.parseInt(stationNumberMatch[1], 10) : undefined);

  return {
    ...row,
    station_name: stationName,
    station_type: formatStationTypeLabel(typeof row.station_type === 'string' ? row.station_type : stationName),
    station_number: stationNumber,
  };
}

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

    return NextResponse.json({ pricing: dedupeStationPricingRows((data || []) as any[]) });
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

    const canonicalStationName = normaliseStationName(stationName);

    // Verify ownership
    const { data: cafe } = await supabase.from('cafes').select('id').eq('id', cafeId).eq('owner_id', ownerId).maybeSingle();
    if (!cafe) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data: existingRows, error: existingRowsError } = await supabase
      .from('station_pricing')
      .select('id, station_name, station_type, station_number')
      .eq('cafe_id', cafeId);

    if (existingRowsError) {
      return NextResponse.json({ error: existingRowsError.message }, { status: 400 });
    }

    const matchingIds = (existingRows || [])
      .filter((row: any) => normaliseStationName(row.station_name, row.station_type, row.station_number) === canonicalStationName)
      .map((row: any) => row.id);

    if (matchingIds.length > 0) {
      const { error } = await supabase.from('station_pricing').delete().in('id', matchingIds);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

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
    const body = await request.json();
    const pricingData = body?.pricingData ? normalizePricingRow(body.pricingData as StationPricingPayload) : null;
    const applyToAll = body?.applyToAll === true;
    const allPricingData = Array.isArray(body?.allPricingData)
      ? body.allPricingData.map((row: StationPricingPayload) => normalizePricingRow(row))
      : [];
    const powerToggleOnly = body?.powerToggleOnly === true;

    const cafeIds = new Set<string>();
    if (powerToggleOnly && pricingData?.cafe_id) {
      cafeIds.add(pricingData.cafe_id);
    } else if (applyToAll && allPricingData.length > 0) {
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
      const { cafe_id, station_name, is_active } = pricingData || {};

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

    if (applyToAll && allPricingData.length > 0) {
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
