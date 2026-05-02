import { PricingTier } from '../types';
import { normaliseConsoleType } from './index';
import { dedupeStationPricingRows, normaliseStationName } from '@/lib/stationNames';

type StationPricingRecord = {
  cafe_id?: string | null;
  station_name?: string | null;
  station_type?: string | null;
  station_number?: number | null;
  is_active?: boolean | null;
  half_hour_rate?: number | null;
  hourly_rate?: number | null;
  controller_1_half_hour?: number | null;
  controller_1_full_hour?: number | null;
  controller_2_half_hour?: number | null;
  controller_2_full_hour?: number | null;
  controller_3_half_hour?: number | null;
  controller_3_full_hour?: number | null;
  controller_4_half_hour?: number | null;
  controller_4_full_hour?: number | null;
  single_player_half_hour_rate?: number | null;
  single_player_rate?: number | null;
  multi_player_half_hour_rate?: number | null;
  multi_player_rate?: number | null;
};
export type StationPricingMap = Record<string, StationPricingRecord>;
export type ConsolePricingMap = Record<string, Record<string, PricingTier>>;

type PricingLookupOptions = {
  stationName?: string | null;
};

function getConsolePricingTier(
  cafeId: string,
  consoleType: string,
  consolePricing: ConsolePricingMap
): PricingTier | null {
  const normType = normaliseConsoleType(consoleType);
  const keyCandidates = [
    normType,
    consoleType,
    normType === "steering" ? "steering_wheel" : null,
    normType === "steering_wheel" ? "steering" : null,
  ].filter((key): key is string => Boolean(key));

  for (const key of keyCandidates) {
    const tier = consolePricing[cafeId]?.[key];
    if (tier) return tier;
  }

  return null;
}

function getNormalizedStationType(station: StationPricingRecord): string {
  const stationType = station.station_type || station.station_name?.split("-")[0] || "";
  return normaliseConsoleType(stationType);
}

function compareStationCandidates(a: StationPricingRecord, b: StationPricingRecord): number {
  const aActive = a.is_active !== false ? 1 : 0;
  const bActive = b.is_active !== false ? 1 : 0;
  if (aActive !== bActive) return bActive - aActive;

  const aNumber = a.station_number ?? Number.MAX_SAFE_INTEGER;
  const bNumber = b.station_number ?? Number.MAX_SAFE_INTEGER;
  if (aNumber !== bNumber) return aNumber - bNumber;

  return (a.station_name || "").localeCompare(b.station_name || "");
}

function getStationPricingCandidate(
  normType: string,
  cafeId: string,
  stationPricing: StationPricingMap,
  stationName?: string | null
): StationPricingRecord | null {
  const pricingRows = dedupeStationPricingRows(Object.values(stationPricing) as StationPricingRecord[])
    .filter((row) => !row.cafe_id || row.cafe_id === cafeId);

  const normalizedStationName = normaliseStationName(stationName);
  if (normalizedStationName) {
    const exactMatch = pricingRows.find(
      (row) => normaliseStationName(row.station_name, row.station_type, row.station_number) === normalizedStationName
    );
    if (exactMatch && getNormalizedStationType(exactMatch) === normType) {
      return exactMatch;
    }
  }

  const candidates = pricingRows
    .filter((row) => getNormalizedStationType(row) === normType)
    .sort(compareStationCandidates);

  return candidates[0] || null;
}

function calculatePriceFromStationPricing(
  station: StationPricingRecord,
  normType: string,
  quantity: number,
  duration: number
): number {
  const calculateFromRates = (halfHourRate: number | null | undefined, hourlyRate: number | null | undefined) => {
    const safeDuration = Math.max(0, Number(duration) || 0);
    if (safeDuration <= 0 || safeDuration % 30 !== 0) return 0;

    const fullHourBlocks = Math.floor(safeDuration / 60);
    const hasHalfHourRemainder = safeDuration % 60 === 30;
    return ((Number(hourlyRate || 0) * fullHourBlocks) + (hasHalfHourRemainder ? Number(halfHourRate || 0) : 0));
  };

  if (normType === "ps5" || normType === "xbox") {
    return calculateFromRates(
      station[`controller_${quantity}_half_hour` as keyof StationPricingRecord] as number | null | undefined,
      station[`controller_${quantity}_full_hour` as keyof StationPricingRecord] as number | null | undefined
    );
  }

  if (normType === "ps4") {
    const isSinglePlayer = quantity === 1;
    const halfHour = isSinglePlayer
      ? station.single_player_half_hour_rate || 0
      : station.multi_player_half_hour_rate || 0;
    const fullHour = isSinglePlayer
      ? station.single_player_rate || 0
      : station.multi_player_rate || 0;

    return calculateFromRates(halfHour, fullHour);
  }

  const halfHour = station.half_hour_rate || 0;
  const fullHour = station.hourly_rate || 0;

  return calculateFromRates(halfHour, fullHour) * quantity;
}

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
  stationPricing: StationPricingMap,
  options?: PricingLookupOptions
): number {
  const normType = normaliseConsoleType(consoleType);

  // --- Station-based pricing override (station_pricing table) ---
  // Station pricing is treated as the most specific source of truth.
  const matchedStation = getStationPricingCandidate(normType, cafeId, stationPricing, options?.stationName);
  if (matchedStation) {
    const stationPrice = calculatePriceFromStationPricing(matchedStation, normType, quantity, duration);
    if (stationPrice > 0) return stationPrice;
  }

  // --- Tier-based pricing (console_pricing table) ---
  const pricingTier = getConsolePricingTier(cafeId, consoleType, consolePricing);
  if (pricingTier) {
    const isPerStationType = ["pc", "pool", "snooker", "arcade", "vr", "steering", "steering_wheel", "racing_sim"].includes(normType);

    const key = `qty${quantity}_${duration}min` as keyof PricingTier;
    const val = pricingTier[key];
    if (val !== null && val !== undefined) return val as number;

    const safeDuration = Math.max(0, Number(duration) || 0);
    if (safeDuration > 0 && safeDuration % 30 === 0) {
      const halfHourRate = pricingTier[`qty${quantity}_30min` as keyof PricingTier] ?? (isPerStationType ? pricingTier.qty1_30min : null) ?? 50;
      const hourlyRate = pricingTier[`qty${quantity}_60min` as keyof PricingTier] ?? (isPerStationType ? pricingTier.qty1_60min : null) ?? 100;
      const fullHourBlocks = Math.floor(safeDuration / 60);
      const hasHalfHourRemainder = safeDuration % 60 === 30;
      const calculated = ((Number(hourlyRate || 0) * fullHourBlocks) + (hasHalfHourRemainder ? Number(halfHourRate || 0) : 0));

      if (isPerStationType && quantity > 1) {
        const baseHalfHourRate = pricingTier.qty1_30min ?? 50;
        const baseHourlyRate = pricingTier.qty1_60min ?? 100;
        return ((Number(baseHourlyRate || 0) * fullHourBlocks) + (hasHalfHourRemainder ? Number(baseHalfHourRate || 0) : 0)) * quantity;
      }

      return calculated;
    }
  }

  // Neither station pricing nor console pricing had a match — returning fallback ₹100
  console.warn(
    `[calcBillingPrice] No pricing found for consoleType="${consoleType}" qty=${quantity} dur=${duration} cafeId=${cafeId} — falling back to ₹100`
  );
  return 100; // fallback
}
