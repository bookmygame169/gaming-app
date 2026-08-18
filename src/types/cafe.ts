// src/types/cafe.ts
export type Cafe = {
  id: string;
  name: string;
  slug?: string | null; // SEO-friendly URL slug
  address: string | null;
  city?: string | null;
  hourly_price: number | null;
  cover_url: string | null;

  ps5_count?: number | null;
  ps4_count?: number | null;
  xbox_count?: number | null;
  pc_count?: number | null;
  pool_count?: number | null;
  arcade_count?: number | null;

  // NEW
  steering_wheel_count?: number | null; // steering wheel setup
  racing_sim_count?: number | null;     // racing simulator
  vr_count?: number | null;             // VR setups
  snooker_count?: number | null;        // snooker tables

  // status flags
  is_active?: boolean | null;   // used by "Deactivate" in admin
  is_deleted?: boolean | null;  // used by "Delist" / soft delete

  // café details
  opening_hours?: string | null;
  peak_hours?: string | null;
  popular_games?: string | null;
  offers?: string | null;

  // device specs
  monitor_details?: string | null;
  processor_details?: string | null;
  gpu_details?: string | null;
  ram_details?: string | null;
  accessories_details?: string | null;

  created_at?: string;
};

/**
 * The count columns, as a type rather than a string.
 *
 * The equipment rows pick a café's counts by key from a config array, and were
 * doing it through `(cafe as any)[key]` — which turns off checking for the
 * whole expression, so a typo in one of those keys would have read undefined
 * and rendered nothing at all.
 */
export type CafeCountField = Extract<
  keyof Cafe,
  | "ps5_count"
  | "ps4_count"
  | "xbox_count"
  | "pc_count"
  | "pool_count"
  | "arcade_count"
  | "steering_wheel_count"
  | "racing_sim_count"
  | "vr_count"
  | "snooker_count"
>;

/**
 * Fields the café listing renders but the database does not have.
 *
 * is_premium, is_verified, rating, distance and popularity are all read in
 * CafeList and none of them is a column on `cafes`. Every one arrives
 * undefined, so the premium badge, the verified tick, the star rating, the
 * distance and the "N+ playing now" line have never once appeared. The reads
 * were written as `(cafe as any).rating`, and the cast is what stopped anyone
 * finding out.
 *
 * Declared optional rather than deleted: the UI for them is written and
 * working, and it starts appearing the day the columns exist. Kept separate
 * from Cafe so the distinction between "we store this" and "we would show this
 * if we did" stays visible.
 */
export type CafeDisplayExtras = {
  is_premium?: boolean | null;
  is_verified?: boolean | null;
  rating?: number | string | null;
  distance?: number | string | null;
  popularity?: number | string | null;
};

/** A café as the listing reads it: stored columns plus the dormant extras. */
export type CafeListItem = Cafe & CafeDisplayExtras;