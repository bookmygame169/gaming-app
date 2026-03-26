import { NextRequest, NextResponse } from 'next/server';
import { requireOwnerContext } from '@/lib/ownerAuth';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;

    const { supabase } = auth.context;
    const { pricingData, applyToAll, allPricingData } = await request.json();

    if (applyToAll && allPricingData?.length > 0) {
      const { error } = await supabase
        .from('station_pricing')
        .upsert(allPricingData, { onConflict: 'cafe_id,station_name' });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    } else {
      const { error } = await supabase
        .from('station_pricing')
        .upsert(pricingData, { onConflict: 'cafe_id,station_name' });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
