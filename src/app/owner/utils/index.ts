import { CONSOLE_DB_KEYS, type ConsoleId } from "@/lib/constants";

// Helper functions for time conversion

export const getLocalDateString = (date: Date = new Date()): string => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};


export function convertTo24Hour(timeStr: string): string {
  if (!timeStr) return "";

  // Trim whitespace
  const time = timeStr.trim();

  // console.log('[convertTo24Hour] Input:', JSON.stringify(time), 'Length:', time.length);

  // Try 12-hour format with am/pm (e.g., "10:30 am", "2:00pm", "10:30 AM")
  const match12h = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)$/i);
  if (match12h) {
    let hours = parseInt(match12h[1]);
    const minutes = match12h[2];
    const period = match12h[3].toLowerCase();

    if (period === "pm" && hours !== 12) {
      hours += 12;
    } else if (period === "am" && hours === 12) {
      hours = 0;
    }

    const result = `${hours.toString().padStart(2, "0")}:${minutes}`;
    // console.log('[convertTo24Hour] Matched 12h format, result:', result);
    return result;
  }

  // Try 24-hour format (e.g., "14:30", "14:30:00", "9:30")
  const match24h = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match24h) {
    const hours = match24h[1].padStart(2, "0");
    const minutes = match24h[2];
    const result = `${hours}:${minutes}`;
    // console.log('[convertTo24Hour] Matched 24h format, result:', result);
    return result;
  }

  // Try extracting numbers from any format (e.g., "10:30:00 am", with extra spaces)
  const matchAny = time.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?/i);
  if (matchAny) {
    let hours = parseInt(matchAny[1]);
    const minutes = matchAny[2];
    const period = matchAny[3]?.toLowerCase();

    if (period === "pm" && hours !== 12) {
      hours += 12;
    } else if (period === "am" && hours === 12) {
      hours = 0;
    }

    const result = `${hours.toString().padStart(2, "0")}:${minutes}`;
    // console.log('[convertTo24Hour] Matched relaxed format, result:', result);
    return result;
  }

  // If nothing matches, return empty string
  console.warn('[convertTo24Hour] Unrecognized time format:', JSON.stringify(timeStr));
  return "";
}

export function convertTo12Hour(timeStr?: string | null): string {
  if (!timeStr) {
    // If no time provided, use current time
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const period = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
  }

  // Check if already in 12-hour format (has am/pm)
  const match12h = timeStr.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)/i);
  if (match12h) {
    const hours = parseInt(match12h[1]);
    const minutes = match12h[2];
    const period = match12h[3].toUpperCase();
    return `${hours}:${minutes} ${period}`;
  }

  // Parse 24-hour format (e.g., "16:22", "14:30:00")
  const match24h = timeStr.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (match24h) {
    let hours = parseInt(match24h[1]);
    const minutes = match24h[2];
    const period = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${period}`;
  }

  return timeStr; // Return original if can't parse
}

/**
 * Normalise any console type string variant to canonical lowercase key.
 * e.g. 'PS5', 'Ps5', 'PS 5' → 'ps5'  |  'Racing Sim', 'racing sim' → 'racing_sim'
 */
export function normaliseConsoleType(raw: string): string {
  if (!raw) return raw;
  const s = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  // Map known aliases to canonical keys
  const aliases: Record<string, string> = {
    steering_wheel: 'steering',
    'racing-sim': 'racing_sim',
    racingsim: 'racing_sim',
    nintendo: 'nintendo_switch',
    switch: 'nintendo_switch',
  };
  return aliases[s] ?? s;
}

type CafeConsoleCounts = {
  ps5_count?: number | null;
  ps4_count?: number | null;
  xbox_count?: number | null;
  pc_count?: number | null;
  pool_count?: number | null;
  arcade_count?: number | null;
  snooker_count?: number | null;
  vr_count?: number | null;
  steering_wheel_count?: number | null;
  racing_sim_count?: number | null;
};

export function getAvailableConsoleIds(cafe?: CafeConsoleCounts | null): ConsoleId[] {
  if (!cafe) return [];

  return (Object.keys(CONSOLE_DB_KEYS) as ConsoleId[]).filter((consoleId) => {
    const countKey = CONSOLE_DB_KEYS[consoleId] as keyof CafeConsoleCounts;
    const count = cafe[countKey];
    return typeof count === "number" && count > 0;
  });
}

// Helper function to get console icon
export function getConsoleIcon(consoleType: string): string {
  const type = consoleType?.toUpperCase() || '';
  if (type.includes('PC')) return '🖥️';
  if (type.includes('PS5')) return '🎮';
  if (type.includes('PS4')) return '🎮';
  if (type.includes('XBOX')) return '🎮';
  if (type.includes('VR')) return '🥽';
  if (type.includes('STEERING')) return '🏎️';
  if (type.includes('POOL')) return '🎱';
  if (type.includes('SNOOKER')) return '🎱';
  if (type.includes('ARCADE')) return '🕹️';
  if (type.includes('NINTENDO') || type.includes('SWITCH')) return '🎮';
  return '🎮'; // Default
}

/**
 * Returns IST offset (+05:30) for PostgreSQL timestamp filters.
 * Hardcoded to IST — all cafes are in India. Previously read from browser
 * timezone (date.getTimezoneOffset()), which broke for anyone outside India.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const getTimezoneOffset = (_date?: Date): string => '+05:30';
