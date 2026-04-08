import { CONSOLE_LABELS, type ConsoleId } from "@/lib/constants";

export type StationPricingLike = {
  station_name?: string | null;
  station_type?: string | null;
  station_number?: number | null;
  is_active?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const CONSOLE_TYPE_ALIASES: Record<string, string> = {
  steering_wheel: "steering",
  steeringwheel: "steering",
  racingsim: "racing_sim",
  nintendo: "nintendo_switch",
  switch: "nintendo_switch",
};

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (match) => match.toUpperCase());
}

function parseStationName(raw: string | null | undefined): { typePart: string; stationNumber: number | null } {
  const trimmed = raw?.trim() || "";
  if (!trimmed) {
    return { typePart: "", stationNumber: null };
  }

  const match = trimmed.match(/^(.*?)(?:[\s_-]+(\d+))$/);
  if (!match) {
    return { typePart: trimmed, stationNumber: null };
  }

  return {
    typePart: match[1] || "",
    stationNumber: Number.parseInt(match[2], 10) || null,
  };
}

function getStationTimestamp(row: StationPricingLike): number {
  const updatedAt = row.updated_at ? Date.parse(row.updated_at) : NaN;
  if (!Number.isNaN(updatedAt)) return updatedAt;

  const createdAt = row.created_at ? Date.parse(row.created_at) : NaN;
  return Number.isNaN(createdAt) ? 0 : createdAt;
}

function isExactCanonicalStationName(row: StationPricingLike): boolean {
  const rawName = row.station_name?.trim().toLowerCase() || "";
  return rawName !== "" && rawName === normaliseStationName(row.station_name, row.station_type, row.station_number);
}

function toCanonicalStationRow<T extends StationPricingLike>(row: T): T {
  const canonicalName = normaliseStationName(row.station_name, row.station_type, row.station_number);
  const parsedStationNumber = Number.parseInt(canonicalName.split("-").pop() || "", 10);
  const canonicalStationNumber = row.station_number && row.station_number > 0
    ? row.station_number
    : (Number.isNaN(parsedStationNumber) ? row.station_number : parsedStationNumber);

  return {
    ...row,
    station_name: canonicalName || row.station_name,
    station_type: formatStationTypeLabel(row.station_type || canonicalName),
    station_number: canonicalStationNumber,
  };
}

function compareDisplayOrder(a: StationPricingLike, b: StationPricingLike): number {
  const aNumber = a.station_number ?? Number.MAX_SAFE_INTEGER;
  const bNumber = b.station_number ?? Number.MAX_SAFE_INTEGER;
  if (aNumber !== bNumber) return aNumber - bNumber;

  const aName = normaliseStationName(a.station_name, a.station_type, a.station_number);
  const bName = normaliseStationName(b.station_name, b.station_type, b.station_number);
  return aName.localeCompare(bName);
}

function pickPreferredStationRow<T extends StationPricingLike>(current: T, candidate: T): T {
  const currentTimestamp = getStationTimestamp(current);
  const candidateTimestamp = getStationTimestamp(candidate);
  if (currentTimestamp !== candidateTimestamp) {
    return candidateTimestamp > currentTimestamp ? candidate : current;
  }

  const currentCanonical = isExactCanonicalStationName(current);
  const candidateCanonical = isExactCanonicalStationName(candidate);
  if (currentCanonical !== candidateCanonical) {
    return candidateCanonical ? candidate : current;
  }

  const currentActive = current.is_active !== false;
  const candidateActive = candidate.is_active !== false;
  if (currentActive !== candidateActive) {
    return candidateActive ? candidate : current;
  }

  return compareDisplayOrder(candidate, current) < 0 ? candidate : current;
}

export function normaliseConsoleType(raw: string | null | undefined): string {
  if (!raw) return "";

  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  return CONSOLE_TYPE_ALIASES[normalized] ?? normalized;
}

export function formatStationTypeLabel(raw: string | null | undefined): string {
  const canonicalType = normaliseConsoleType(raw);
  if (!canonicalType) return "";

  if (canonicalType in CONSOLE_LABELS) {
    return CONSOLE_LABELS[canonicalType as ConsoleId];
  }

  return titleCase(canonicalType.replace(/_/g, " "));
}

export function normaliseStationName(
  raw: string | null | undefined,
  stationType?: string | null,
  stationNumber?: number | null
): string {
  const { typePart, stationNumber: parsedStationNumber } = parseStationName(raw);
  const canonicalType = normaliseConsoleType(stationType || typePart);
  if (!canonicalType) return "";

  const canonicalNumber = stationNumber && stationNumber > 0 ? stationNumber : parsedStationNumber;
  if (!canonicalNumber) {
    return canonicalType;
  }

  return `${canonicalType}-${String(canonicalNumber).padStart(2, "0")}`;
}

export function formatStationOptionLabel(raw: string | null | undefined): string {
  const canonicalName = normaliseStationName(raw);
  if (!canonicalName) return "";

  const match = canonicalName.match(/^(.*)-(\d+)$/);
  if (!match) {
    return canonicalName.replace(/_/g, " ").toUpperCase();
  }

  const [, stationType, stationNumber] = match;
  return `${formatStationTypeLabel(stationType).toUpperCase()}-${stationNumber}`;
}

export function dedupeStationPricingRows<T extends StationPricingLike>(rows: T[]): T[] {
  const rowsByStation = new Map<string, T>();

  rows.forEach((row) => {
    const canonicalName = normaliseStationName(row.station_name, row.station_type, row.station_number);
    if (!canonicalName) return;

    const canonicalRow = toCanonicalStationRow(row);
    const existing = rowsByStation.get(canonicalName);
    rowsByStation.set(canonicalName, existing ? pickPreferredStationRow(existing, canonicalRow) : canonicalRow);
  });

  return Array.from(rowsByStation.values()).sort(compareDisplayOrder);
}

export function buildStationPricingMap<T extends StationPricingLike>(rows: T[]): Record<string, T> {
  return Object.fromEntries(
    dedupeStationPricingRows(rows)
      .filter((row) => Boolean(row.station_name))
      .map((row) => [row.station_name as string, row])
  );
}
