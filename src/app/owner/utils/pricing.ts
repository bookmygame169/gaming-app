import { PricingTier } from '../types';

export type StationPricingMap = Record<string, any>;
export type ConsolePricingMap = Record<string, Record<string, PricingTier>>;

/**
 * Single source of truth for computing a console booking price.
 * Used in both useBilling (new bookings) and page.tsx (edit booking auto-calc).
 */
export function calcBillingPrice(
  consoleType: string,
  quantity: number,
  duration: number,
  cafeId: string,
  consolePricing: ConsolePricingMap,
  stationPricing: StationPricingMap
): number {
  // --- Tier-based pricing (console_pricing table) ---
  const pricingTier = consolePricing[cafeId]?.[consoleType];
  if (pricingTier) {
    if (duration === 90) {
      const p60 = pricingTier[`qty${quantity}_60min` as keyof PricingTier] ?? 100;
      const p30 = pricingTier[`qty${quantity}_30min` as keyof PricingTier] ?? 50;
      return (p60 || 0) + (p30 || 0);
    }
    if (duration === 120) {
      const p60 = pricingTier[`qty${quantity}_60min` as keyof PricingTier] ?? 100;
      return (p60 || 0) * 2;
    }
    if (duration === 180) {
      const p60 = pricingTier[`qty${quantity}_60min` as keyof PricingTier] ?? 100;
      return (p60 || 0) * 3;
    }
    const key = `qty${quantity}_${duration}min` as keyof PricingTier;
    const val = pricingTier[key];
    if (val !== null && val !== undefined) return val as number;
  }

  // --- Station-based pricing (station_pricing table) ---
  const typeMap: Record<string, string> = {
    ps5: 'PS5', ps4: 'PS4', xbox: 'Xbox', pc: 'PC',
    pool: 'Pool', snooker: 'Snooker', arcade: 'Arcade', vr: 'VR',
    steering: 'Steering', steering_wheel: 'Steering', racing_sim: 'Racing Sim',
  };
  const stType = typeMap[consoleType] || consoleType;
  const station = Object.values(stationPricing).find((s: any) => s.station_type === stType);

  if (station) {
    if (stType === 'PS5' || stType === 'Xbox') {
      if (duration === 30) return station[`controller_${quantity}_half_hour`] || 100;
      if (duration === 60) return station[`controller_${quantity}_full_hour`] || 100;
      if (duration === 90) return (station[`controller_${quantity}_half_hour`] || 50) + (station[`controller_${quantity}_full_hour`] || 100);
      if (duration === 120) return (station[`controller_${quantity}_full_hour`] || 100) * 2;
      if (duration === 180) return (station[`controller_${quantity}_full_hour`] || 100) * 3;
    }
    if (stType === 'PS4') {
      const single = quantity === 1;
      const h = single ? station.single_player_half_hour_rate || 75 : station.multi_player_half_hour_rate || 150;
      const f = single ? station.single_player_rate || 150 : station.multi_player_rate || 300;
      if (duration === 30) return h;
      if (duration === 60) return f;
      if (duration === 90) return h + f;
      if (duration === 120) return f * 2;
      if (duration === 180) return f * 3;
    }
    // Generic stations
    if (duration === 30) return station.half_hour_rate || 50;
    if (duration === 60) return station.hourly_rate || 100;
    if (duration === 90) return (station.half_hour_rate || 50) + (station.hourly_rate || 100);
    if (duration === 120) return (station.hourly_rate || 100) * 2;
    if (duration === 180) return (station.hourly_rate || 100) * 3;
  }

  return 100; // fallback
}
