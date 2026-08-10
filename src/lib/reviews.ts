import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Review summaries.
 *
 * Averages are computed here rather than cached on the cafés row, so there is
 * only ever one number and it cannot go stale after an edit or a deletion.
 */

export type ReviewSummary = {
  average: number;
  count: number;
  /** How many gave 1★, 2★ … 5★. Index 0 is 1★. */
  distribution: [number, number, number, number, number];
};

export const EMPTY_SUMMARY: ReviewSummary = {
  average: 0,
  count: 0,
  distribution: [0, 0, 0, 0, 0],
};

export function summarise(ratings: number[]): ReviewSummary {
  if (ratings.length === 0) return EMPTY_SUMMARY;

  const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  let total = 0;

  for (const raw of ratings) {
    const rating = Math.round(Number(raw));
    if (rating < 1 || rating > 5) continue;
    distribution[rating - 1] += 1;
    total += rating;
  }

  const count = distribution.reduce((sum, n) => sum + n, 0);
  if (count === 0) return EMPTY_SUMMARY;

  return {
    // One decimal place is what a rating is read at. More precision implies
    // an accuracy that eleven reviews do not have.
    average: Math.round((total / count) * 10) / 10,
    count,
    distribution,
  };
}

/** Review summaries for several cafés at once, for list pages. */
export async function getSummariesForCafes(
  supabase: SupabaseClient,
  cafeIds: string[]
): Promise<Map<string, ReviewSummary>> {
  const summaries = new Map<string, ReviewSummary>();
  if (cafeIds.length === 0) return summaries;

  const { data, error } = await supabase
    .from("cafe_reviews")
    .select("cafe_id, rating")
    .in("cafe_id", cafeIds)
    .eq("is_hidden", false);

  if (error || !data) return summaries;

  const byCafe = new Map<string, number[]>();
  for (const row of data) {
    const list = byCafe.get(row.cafe_id) ?? [];
    list.push(Number(row.rating));
    byCafe.set(row.cafe_id, list);
  }

  for (const [cafeId, ratings] of byCafe) {
    summaries.set(cafeId, summarise(ratings));
  }

  return summaries;
}
