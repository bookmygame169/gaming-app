"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ActiveSessionTimer from "@/components/ActiveSessionTimer";
import PWAInstaller from "@/components/PWAInstaller";
import type { Cafe } from "../types/cafe";

/**
 * The customer landing page, in the BookMyGame Site design.
 *
 * Lime on near-black, Archivo for names and IBM Plex Mono for anything that
 * reads as an instrument — the same identity the café PCs run, so somebody who
 * books here and then sits down at a machine meets one product rather than two.
 *
 * Every figure on this page is computed from the cafés, plans and tournaments
 * the app already has. Two things the design shows are deliberately absent:
 * a distance per café, because no café has coordinates to measure from, and a
 * star rating, because the reviews table is empty and a made-up 4.8 is worse
 * than no rating at all. Live seats-free is on the café's own page, where a
 * time has been chosen and the number means something.
 */

type SortKey = "relevance" | "price_asc" | "price_desc";

type MembershipTierPreview = {
  id: string;
  cafeId: string;
  cafeName: string;
  planType: string;
  name: string;
  description?: string | null;
  price: number;
  hours?: number | null;
  validityDays: number;
};

type TournamentPreview = {
  id: string;
  name: string;
  game: string;
  status?: string | null;
  tournament_date: string;
  tournament_time?: string | null;
  prize_amount?: number | null;
  max_participants?: number | null;
  current_participants?: number | null;
  location?: string | null;
};

/**
 * The station kinds a café can have, as the chips and filters use them.
 *
 * One list, read by the filter row, the card's chips and the seat count, so a
 * café that gains a new kind of station cannot appear in one and not another.
 */
const RIGS = [
  { key: "pc_count", label: "PC" },
  { key: "ps5_count", label: "PS5" },
  { key: "ps4_count", label: "PS4" },
  { key: "xbox_count", label: "XBOX" },
  { key: "vr_count", label: "VR" },
  { key: "racing_sim_count", label: "RACING" },
  { key: "steering_wheel_count", label: "WHEEL" },
  { key: "pool_count", label: "POOL" },
  { key: "snooker_count", label: "SNOOKER" },
  { key: "arcade_count", label: "ARCADE" },
] as const;

type RigKey = (typeof RIGS)[number]["key"];

function countOf(cafe: Cafe, key: RigKey): number {
  return Number((cafe as unknown as Record<string, number | null>)[key] ?? 0) || 0;
}

function seatsIn(cafe: Cafe): number {
  return RIGS.reduce((sum, rig) => sum + countOf(cafe, rig.key), 0);
}

export default function HomeClient({ cafes }: { cafes: Cafe[] }) {
  const safeCafes = useMemo<Cafe[]>(() => (Array.isArray(cafes) ? cafes : []), [cafes]);

  const [query, setQuery] = useState("");
  const [rig, setRig] = useState<RigKey | "all">("all");
  const [sortBy, setSortBy] = useState<SortKey>("relevance");
  const [tiers, setTiers] = useState<MembershipTierPreview[]>([]);
  const [tournaments, setTournaments] = useState<TournamentPreview[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [planRes, tourRes] = await Promise.all([
          fetch("/api/memberships/plans"),
          fetch("/api/tournaments?status=upcoming"),
        ]);

        if (planRes.ok) {
          const data = await planRes.json();
          if (!cancelled) setTiers(Array.isArray(data?.plans) ? data.plans : []);
        }

        if (tourRes.ok) {
          const data = await tourRes.json();
          if (!cancelled) {
            setTournaments(Array.isArray(data?.tournaments) ? data.tournaments : []);
          }
        }
      } catch {
        // Both sections simply do not appear. A landing page is not worth an
        // error message the visitor can do nothing about.
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalSeats = useMemo(
    () => safeCafes.reduce((sum, cafe) => sum + seatsIn(cafe), 0),
    [safeCafes]
  );

  const cheapestHour = useMemo(() => {
    const prices = safeCafes
      .map((cafe) => Number(cafe.hourly_price) || 0)
      .filter((price) => price > 0);

    return prices.length > 0 ? Math.min(...prices) : null;
  }, [safeCafes]);

  const cities = useMemo(() => {
    const found = new Set(
      safeCafes.map((cafe) => (cafe.city || "").trim()).filter((city) => city.length > 0)
    );
    return [...found];
  }, [safeCafes]);

  // Only the kinds some café actually has. A filter for VR in a city with no VR
  // is a chip that can only ever empty the page.
  const availableRigs = useMemo(
    () => RIGS.filter((entry) => safeCafes.some((cafe) => countOf(cafe, entry.key) > 0)),
    [safeCafes]
  );

  const filtered = useMemo(() => {
    let list = [...safeCafes];

    if (query.trim()) {
      const needle = query.trim().toLowerCase();
      list = list.filter((cafe) =>
        [cafe.name, cafe.address, cafe.city, cafe.popular_games].some((field) =>
          field?.toLowerCase().includes(needle)
        )
      );
    }

    if (rig !== "all") {
      list = list.filter((cafe) => countOf(cafe, rig) > 0);
    }

    if (sortBy === "price_asc") {
      list.sort(
        (a, b) =>
          (a.hourly_price ?? Number.POSITIVE_INFINITY) -
          (b.hourly_price ?? Number.POSITIVE_INFINITY)
      );
    } else if (sortBy === "price_desc") {
      list.sort((a, b) => (b.hourly_price ?? 0) - (a.hourly_price ?? 0));
    }

    return list;
  }, [safeCafes, query, rig, sortBy]);

  const nextTournament = tournaments[0] ?? null;

  const ticker = useMemo(() => {
    const parts: string[] = [];

    for (const cafe of safeCafes.slice(0, 4)) {
      const seats = seatsIn(cafe);
      if (seats > 0) {
        parts.push(`${cafe.name.toUpperCase()} — ${seats} SEATS`);
      }
    }

    if (nextTournament) {
      parts.push(`${nextTournament.game.toUpperCase()} — ${formatWhen(nextTournament)}`);
    }

    if (cheapestHour !== null) {
      parts.push(`FROM ₹${cheapestHour} AN HOUR`);
    }

    return parts.length > 0 ? `${parts.join("   ///   ")}   ///   ` : "";
  }, [safeCafes, nextTournament, cheapestHour]);

  const stats = [
    { label: "PARTNER CAFES", value: String(safeCafes.length) },
    { label: "SEATS BOOKABLE", value: String(totalSeats) },
    {
      label: "FROM, PER HOUR",
      value: cheapestHour !== null ? `₹${cheapestHour}` : "—",
    },
    {
      label: "TOURNAMENTS OPEN",
      value: String(tournaments.length),
      accent: tournaments.length > 0,
    },
  ];

  return (
    <main className="min-h-screen bg-[#0b0b0c] text-[#f2f0ea]">
      <ActiveSessionTimer />

      {/* ── hero ─────────────────────────────────────────────────────── */}
      <section className="grid border-b border-[#f2f0ea]/[0.12] lg:grid-cols-[1.35fr_0.65fr]">
        <div className="border-b border-[#f2f0ea]/[0.12] px-5 pb-14 pt-14 sm:px-8 lg:border-b-0 lg:border-r lg:px-12 lg:pb-16 lg:pt-20 2xl:px-16 2xl:pb-24 2xl:pt-28">
          <div className="flex items-center gap-3 font-mono text-[11px] tracking-[0.28em] text-[#f2f0ea]/45 sm:text-xs 2xl:text-[14px]">
            <span className="block h-2 w-2 animate-pulse bg-[#d8ff3c]" />
            {cities.length > 0 ? cities.join(" · ").toUpperCase() : "GAMING CAFES"}
            {totalSeats > 0 && ` · ${totalSeats} SEATS BOOKABLE`}
          </div>

          <h1 className="mt-6 font-display text-[clamp(44px,7.4vw,152px)] font-black uppercase leading-[0.88] tracking-[-0.04em] text-balance">
            Book the
            <br />
            seat. Skip
            <br />
            the <span className="text-[#d8ff3c]">queue.</span>
          </h1>

          <p className="mt-7 max-w-[520px] font-mono text-sm leading-[1.8] text-[#f2f0ea]/50 sm:text-base 2xl:max-w-[620px] 2xl:text-[18px]">
            Live availability at gaming cafés near you. Pick a rig, pick an hour, pay from your
            wallet — your station unlocks the moment you sit down.
          </p>

          <div className="mt-10 flex flex-wrap gap-3.5">
            <a
              href="#venues"
              className="bg-[#d8ff3c] px-8 py-5 font-display text-base font-black tracking-[0.1em] text-[#0b0b0c] transition-[filter,transform] hover:-translate-y-0.5 hover:brightness-110 sm:px-11 sm:text-lg 2xl:px-14 2xl:py-7 2xl:text-[22px]"
            >
              BOOK NOW →
            </a>
            <Link
              href="/tournaments"
              className="border border-[#f2f0ea]/20 px-7 py-5 font-mono text-xs font-semibold tracking-[0.2em] text-[#f2f0ea]/70 transition-colors hover:border-[#f2f0ea] hover:text-[#f2f0ea] sm:text-[13px] 2xl:px-10 2xl:py-7 2xl:text-[15px]"
            >
              HOST A TOURNAMENT
            </Link>
          </div>
        </div>

        <div className="flex flex-col">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-1 items-baseline justify-between gap-4 border-b border-[#f2f0ea]/10 px-6 py-6 sm:px-10 2xl:px-14 2xl:py-9"
            >
              <span className="font-mono text-[11px] tracking-[0.22em] text-[#f2f0ea]/40 sm:text-xs 2xl:text-[14px]">
                {stat.label}
              </span>
              <span
                className={`font-display text-3xl font-black tracking-[-0.03em] sm:text-[38px] 2xl:text-[46px] ${
                  stat.accent ? "text-[#d8ff3c]" : "text-[#f2f0ea]"
                }`}
              >
                {stat.value}
              </span>
            </div>
          ))}

          {nextTournament ? (
            <Link
              href="/tournaments"
              className="bg-[#d8ff3c]/[0.06] px-6 py-6 transition-colors hover:bg-[#d8ff3c]/[0.12] sm:px-10 2xl:px-14 2xl:py-9"
            >
              <div className="font-mono text-[11px] tracking-[0.22em] text-[#d8ff3c] sm:text-xs 2xl:text-[14px]">
                NEXT TOURNAMENT
              </div>
              <div className="mt-2.5 text-xl font-extrabold leading-tight sm:text-[22px] 2xl:text-[28px]">
                {nextTournament.game} · {formatWhen(nextTournament)}
              </div>
              <div className="mt-2 font-mono text-[11px] text-[#f2f0ea]/45 sm:text-xs 2xl:text-[14px]">
                {[
                  nextTournament.prize_amount
                    ? `₹${Number(nextTournament.prize_amount).toLocaleString("en-IN")} POOL`
                    : null,
                  nextTournament.max_participants
                    ? `${nextTournament.current_participants ?? 0}/${nextTournament.max_participants} IN`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </Link>
          ) : (
            <div className="px-6 py-6 sm:px-10 2xl:px-14 2xl:py-9">
              <div className="font-mono text-[11px] tracking-[0.22em] text-[#f2f0ea]/40 sm:text-xs 2xl:text-[14px]">
                TOURNAMENTS
              </div>
              <div className="mt-2.5 text-xl font-extrabold leading-tight sm:text-[22px] 2xl:text-[28px]">
                Nothing scheduled yet
              </div>
              <div className="mt-2 font-mono text-[11px] text-[#f2f0ea]/45 sm:text-xs 2xl:text-[14px]">
                ASK YOUR CAFÉ ABOUT HOSTING ONE
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── ticker ───────────────────────────────────────────────────── */}
      {ticker && (
        <div className="flex h-[46px] items-center overflow-hidden border-b border-[#f2f0ea]/[0.12] bg-[#f2f0ea]/[0.02] 2xl:h-[58px]">
          <div className="animate-[bmg-marquee_40s_linear_infinite] whitespace-nowrap font-mono text-[11px] tracking-[0.26em] text-[#f2f0ea]/[0.32] sm:text-xs 2xl:text-[14px]">
            {ticker}
            {ticker}
          </div>
        </div>
      )}

      {/* ── venues ───────────────────────────────────────────────────── */}
      <section id="venues" className="px-5 pb-20 pt-12 sm:px-8 lg:px-12 lg:pb-24 lg:pt-14 2xl:px-16 2xl:pt-20">
        <div className="flex flex-col items-stretch border border-[#f2f0ea]/[0.14] md:flex-row">
          <div className="flex flex-1 items-center gap-3.5 px-5">
            <span className="font-mono text-[13px] text-[#f2f0ea]/35">⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search cafés, areas, games…"
              className="w-full border-none bg-transparent py-5 font-mono text-[15px] text-[#f2f0ea] outline-none placeholder:text-[#f2f0ea]/30 2xl:py-7 2xl:text-[17px]"
            />
          </div>

          <label className="flex items-center gap-3 border-t border-[#f2f0ea]/[0.14] px-5 font-mono text-[13px] text-[#f2f0ea]/55 md:border-l md:border-t-0">
            <span className="sr-only">Sort by</span>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortKey)}
              className="cursor-pointer border-none bg-transparent py-4 font-mono text-[13px] uppercase tracking-[0.14em] text-[#f2f0ea]/55 outline-none md:py-0"
            >
              <option value="relevance" className="bg-[#111113]">
                SORT: FEATURED
              </option>
              <option value="price_asc" className="bg-[#111113]">
                SORT: CHEAPEST
              </option>
              <option value="price_desc" className="bg-[#111113]">
                SORT: DEAREST
              </option>
            </select>
          </label>
        </div>

        {availableRigs.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            {[{ key: "all" as const, label: "ALL" }, ...availableRigs].map((entry) => {
              const on = rig === entry.key;
              return (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => setRig(entry.key as RigKey | "all")}
                  className={`border px-4 py-2.5 font-mono text-[11px] font-semibold tracking-[0.16em] transition-colors sm:text-xs ${
                    on
                      ? "border-[#d8ff3c] bg-[#d8ff3c] text-[#0b0b0c]"
                      : "border-[#f2f0ea]/[0.16] text-[#f2f0ea]/60 hover:border-[#d8ff3c]"
                  }`}
                >
                  {entry.label}
                </button>
              );
            })}
          </div>
        )}

        <div className="mb-6 mt-12 flex items-baseline gap-4 sm:gap-[18px] lg:mt-14">
          <h2 className="font-display text-[clamp(26px,3.2vw,52px)] font-black uppercase tracking-[-0.03em]">
            Cafés near you
          </h2>
          <span className="h-px flex-1 bg-[#f2f0ea]/[0.14]" />
          <span className="whitespace-nowrap font-mono text-[11px] tracking-[0.2em] text-[#f2f0ea]/40 sm:text-[13px] 2xl:text-[15px]">
            {filtered.length} {filtered.length === 1 ? "VENUE" : "VENUES"}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="border border-[#f2f0ea]/[0.12] px-6 py-16 text-center">
            <div className="font-display text-2xl font-black uppercase">Nothing matches that</div>
            <p className="mt-3 font-mono text-[13px] text-[#f2f0ea]/45">
              Try a different search, or clear the filter.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((cafe) => (
              <VenueCard key={cafe.id} cafe={cafe} />
            ))}
          </div>
        )}
      </section>

      {/* ── membership ───────────────────────────────────────────────── */}
      {tiers.length > 0 && (
        <section
          id="membership"
          className="grid border-t border-[#f2f0ea]/[0.12] md:grid-cols-2 lg:grid-cols-3"
        >
          {tiers.slice(0, 3).map((tier, index) => {
            const featured = index === 1;
            return (
              <Link
                key={tier.id}
                href="/membership"
                className={`flex flex-col gap-4 border-b border-[#f2f0ea]/[0.12] px-8 py-11 lg:border-b-0 lg:border-r lg:px-10 2xl:px-14 2xl:py-14 ${
                  featured ? "bg-[#d8ff3c] text-[#0b0b0c]" : "text-[#f2f0ea]"
                } ${index === 2 ? "bg-[#f2f0ea]/[0.03]" : ""}`}
              >
                <span
                  className={`font-mono text-[11px] tracking-[0.26em] sm:text-xs ${
                    featured ? "text-[#0b0b0c]/55" : "text-[#f2f0ea]/40"
                  }`}
                >
                  {tier.cafeName.toUpperCase()}
                </span>

                <div className="font-display text-[clamp(34px,3.8vw,60px)] font-black leading-none tracking-[-0.03em]">
                  ₹{Number(tier.price).toLocaleString("en-IN")}
                </div>

                <div
                  className={`font-mono text-[13px] leading-[1.8] ${
                    featured ? "text-[#0b0b0c]/70" : "text-[#f2f0ea]/45"
                  }`}
                >
                  {tier.name}
                  <br />
                  {describeTier(tier)}
                </div>

                <span className="mt-auto pt-5 font-mono text-[11px] font-semibold tracking-[0.2em] sm:text-xs">
                  GET MEMBERSHIP →
                </span>
              </Link>
            );
          })}
        </section>
      )}

      <PWAInstaller />
    </main>
  );
}

/**
 * One café, as the design's card.
 *
 * The photo area carries the café's own cover where it has one and the design's
 * hatch where it does not — a hatch reads as a picture yet to arrive, which is
 * true, while a stretched placeholder reads as a broken page.
 */
function VenueCard({ cafe }: { cafe: Cafe }) {
  const seats = seatsIn(cafe);
  const rigs = RIGS.filter((entry) => countOf(cafe, entry.key) > 0).slice(0, 3);
  const price = Number(cafe.hourly_price) || 0;

  return (
    <Link
      href={`/cafes/${cafe.slug || cafe.id}`}
      className="flex flex-col border border-[#f2f0ea]/[0.12] bg-[#f2f0ea]/[0.02] transition-[border-color,transform] hover:-translate-y-1 hover:border-[#d8ff3c]"
    >
      <div
        className="relative h-[210px] border-b border-[#f2f0ea]/[0.12] bg-cover bg-center"
        style={
          cafe.cover_url
            ? { backgroundImage: `url(${cafe.cover_url})` }
            : {
                backgroundImage:
                  "repeating-linear-gradient(135deg, rgba(242,240,234,.07) 0 8px, transparent 8px 16px)",
              }
        }
      >
        <span className="absolute left-3.5 top-3.5 bg-[#d8ff3c] px-3 py-1.5 font-mono text-[11px] font-semibold tracking-[0.16em] text-[#0b0b0c]">
          {seats > 0 ? `${seats} SEATS` : "BOOKABLE"}
        </span>

        {cafe.city && (
          <span className="absolute right-3.5 top-3.5 bg-[#0b0b0c]/70 px-3 py-1.5 font-mono text-[11px] tracking-[0.14em] text-[#f2f0ea]/70">
            {cafe.city.toUpperCase()}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4 px-5 py-5">
        <div>
          <div className="text-[22px] font-extrabold leading-tight tracking-[-0.01em]">
            {cafe.name}
          </div>
          {cafe.address && (
            <div className="mt-2 font-mono text-xs tracking-[0.12em] text-[#f2f0ea]/42 line-clamp-1">
              {cafe.address}
            </div>
          )}
        </div>

        {rigs.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {rigs.map((entry) => (
              <span
                key={entry.key}
                className="border border-[#f2f0ea]/[0.14] px-2.5 py-1.5 font-mono text-[11px] tracking-[0.1em] text-[#f2f0ea]/65"
              >
                {countOf(cafe, entry.key)} {entry.label}
              </span>
            ))}
          </div>
        )}

        {cafe.opening_hours && (
          <div className="font-mono text-[11px] tracking-[0.14em] text-[#f2f0ea]/35">
            {cafe.opening_hours.toUpperCase()}
          </div>
        )}

        <div className="mt-auto flex items-end justify-between border-t border-[#f2f0ea]/10 pt-4">
          <div>
            <div className="font-display text-[28px] font-black tracking-[-0.02em]">
              {price > 0 ? `₹${price}` : "—"}
            </div>
            <div className="font-mono text-[11px] tracking-[0.14em] text-[#f2f0ea]/35">
              PER HOUR · FROM
            </div>
          </div>
          <span className="bg-[#d8ff3c] px-5 py-3 font-display text-[13px] font-black tracking-[0.14em] text-[#0b0b0c]">
            BOOK →
          </span>
        </div>
      </div>
    </Link>
  );
}

function describeTier(tier: MembershipTierPreview): string {
  const bits: string[] = [];

  if (tier.planType === "day_pass") {
    bits.push("Day pass");
  } else if (tier.hours) {
    bits.push(`${tier.hours} hours`);
  } else {
    bits.push("Unlimited play");
  }

  bits.push(`${tier.validityDays} day${tier.validityDays === 1 ? "" : "s"}`);
  return bits.join(" · ");
}

function formatWhen(tournament: TournamentPreview): string {
  try {
    const when = new Date(tournament.tournament_date);
    const day = when.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
    return tournament.tournament_time ? `${day}, ${tournament.tournament_time}` : day;
  } catch {
    return tournament.tournament_date;
  }
}
