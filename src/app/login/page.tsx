// src/app/login/page.tsx
// SERVER component — the figures on this page come from the café list, so they
// are read here rather than fetched from the browser after it paints.

import { getSupabaseServer } from "@/lib/supabaseServer";
import LoginClient from "@/components/LoginClient";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Sign in · BookMyGame",
  description: "Sign in to book a seat at gaming cafés across Delhi NCR.",
};

/** Every kind of machine a café counts, so "seats" means the whole floor. */
const SEAT_COLUMNS = [
  "pc_count",
  "ps5_count",
  "ps4_count",
  "xbox_count",
  "vr_count",
  "racing_sim_count",
  "steering_wheel_count",
  "pool_count",
  "snooker_count",
  "arcade_count",
] as const;

export default async function LoginPage() {
  const supabase = getSupabaseServer();

  const { data, error } = await supabase
    .from("cafes")
    .select(`name, hourly_price, ${SEAT_COLUMNS.join(", ")}`)
    .eq("is_active", true);

  if (error) {
    console.error("[LoginPage] Could not read cafés:", error.message);
  }

  const cafes = (data ?? []) as unknown as Record<string, number | string | null>[];

  const seatCount = cafes.reduce(
    (sum, cafe) =>
      sum + SEAT_COLUMNS.reduce((inner, key) => inner + (Number(cafe[key]) || 0), 0),
    0
  );

  const prices = cafes.map((cafe) => Number(cafe.hourly_price) || 0).filter((price) => price > 0);

  // The same line the home page runs, built from the cafés that exist. Empty
  // when there are none, and the strip is then not drawn at all.
  const parts = cafes
    .slice(0, 4)
    .map((cafe) => {
      const seats = SEAT_COLUMNS.reduce((inner, key) => inner + (Number(cafe[key]) || 0), 0);
      return seats > 0 ? `${String(cafe.name).toUpperCase()} — ${seats} SEATS` : null;
    })
    .filter(Boolean) as string[];

  if (prices.length > 0) parts.push(`FROM ₹${Math.min(...prices)} AN HOUR`);

  return (
    <LoginClient
      cafeCount={cafes.length}
      seatCount={seatCount}
      cheapestHour={prices.length > 0 ? Math.min(...prices) : null}
      ticker={parts.length > 0 ? `${parts.join("   ///   ")}   ///   ` : ""}
    />
  );
}
