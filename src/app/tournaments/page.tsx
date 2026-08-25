// src/app/tournaments/page.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import ScreenTitle from "@/components/ScreenTitle";

type Tournament = {
  id: string;
  name: string;
  game: string;
  icon: string;
  status: string;
  tournament_date: string;
  tournament_time: string;
  prize_amount: number;
  prize_currency: string;
  max_participants: number;
  current_participants: number;
  location: string;
  description: string;
  color: string;
};

/**
 * Tournaments, in the BookMyGame Site design.
 *
 * The design gives this screen a live bracket, quarter-final scores and a
 * season leaderboard. None of those exist as data — there is a tournaments
 * table and nothing that records a match — so what is drawn here is the part
 * that can be filled from it: the next event given the big treatment, then the
 * schedule as rows, then an honest way for a café to ask about hosting.
 *
 * Registration is the same story. It has never been built — the old page
 * popped an alert saying "coming soon" — so the button says where to actually
 * enter rather than pretending to take an entry.
 */
export default function TournamentsPage() {
  const [selected, setSelected] = useState<Tournament | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTournaments() {
      try {
        const response = await fetch("/api/tournaments");
        if (!response.ok) throw new Error("Failed to fetch tournaments");
        const data = await response.json();
        setTournaments(data.tournaments || []);
      } catch (err) {
        console.error("Error fetching tournaments:", err);
        setError("Could not load tournaments");
      } finally {
        setLoading(false);
      }
    }
    fetchTournaments();
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  const { featured, rest, openCount, liveCount } = useMemo(() => {
    const sorted = [...tournaments].sort((a, b) =>
      (a.tournament_date || "").localeCompare(b.tournament_date || "")
    );

    // A tournament happening now takes the big panel; otherwise the next one
    // up does, because that is the one somebody can still get into.
    const live = sorted.find((t) => ["live", "ongoing"].includes((t.status || "").toLowerCase()));
    const head = live ?? sorted[0] ?? null;

    return {
      featured: head,
      rest: sorted.filter((t) => t.id !== head?.id),
      openCount: sorted.filter(
        (t) =>
          !["completed", "cancelled"].includes((t.status || "").toLowerCase()) &&
          t.current_participants < t.max_participants
      ).length,
      liveCount: sorted.filter((t) => ["live", "ongoing"].includes((t.status || "").toLowerCase()))
        .length,
    };
  }, [tournaments]);

  const isLive = (t: Tournament) => ["live", "ongoing"].includes((t.status || "").toLowerCase());
  const isFull = (t: Tournament) => t.current_participants >= t.max_participants;

  const dayOf = (iso: string) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? "—" : String(date.getDate()).padStart(2, "0");
  };
  const monthOf = (iso: string) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? ""
      : date.toLocaleDateString("en-IN", { month: "short" }).toUpperCase();
  };

  return (
    <div className="min-h-screen bg-[#f2f0ea]/[0.02] font-display text-[#f2f0ea]">
      <ScreenTitle
        title="Tournaments"
        meta={
          loading
            ? "LOADING…"
            : `${openCount} OPEN${liveCount > 0 ? ` · ${liveCount} LIVE` : ""}`
        }
      />

      {loading && (
        <div className="border-t border-[#f2f0ea]/[0.12] px-5 py-16 font-mono text-xs tracking-[0.2em] text-[#f2f0ea]/40 sm:px-8 lg:px-12">
          LOADING THE SCHEDULE…
        </div>
      )}

      {error && !loading && (
        <div className="mx-5 mb-8 border border-[#ff5c2b]/40 bg-[#ff5c2b]/[0.08] px-6 py-5 text-sm font-semibold text-[#ff5c2b] sm:mx-8 lg:mx-12">
          {error}
        </div>
      )}

      {!loading && !error && !featured && (
        <div className="border-t border-[#f2f0ea]/[0.12] px-5 py-16 sm:px-8 lg:px-12">
          <div className="font-mono text-xs tracking-[0.28em] text-[#f2f0ea]/40">
            NOTHING ON THE CALENDAR
          </div>
          <h2 className="mt-5 max-w-[16ch] text-[clamp(32px,5vw,56px)] font-black uppercase leading-[0.95] tracking-[-0.04em]">
            No brackets<br />running yet
          </h2>
          <p className="mt-6 max-w-[52ch] font-mono text-[13px] leading-[1.9] text-[#f2f0ea]/45">
            Tournaments are put up by the cafés themselves. When one opens entries it appears
            here with its prize pool, its slots and where to turn up.
          </p>
          <div className="mt-9 flex flex-wrap gap-3.5">
            <Link
              href="/"
              className="bg-[#d8ff3c] px-9 py-[19px] font-display text-[15px] font-black tracking-[0.12em] text-[#0b0b0c] transition-[filter] hover:brightness-110"
            >
              BOOK A SEAT INSTEAD →
            </Link>
            <Link
              href="/contact"
              className="border border-[#f2f0ea]/20 px-[30px] py-[19px] font-mono text-[13px] font-semibold tracking-[0.18em] text-[#f2f0ea]/70 transition-colors hover:border-[#f2f0ea] hover:text-[#f2f0ea]"
            >
              HOST A TOURNAMENT
            </Link>
          </div>
        </div>
      )}

      {!loading && !error && featured && (
        <>
          <div className="border-t border-[#f2f0ea]/[0.12] px-5 pb-11 pt-10 sm:px-8 lg:px-12">
            <div className="flex items-center gap-3 font-mono text-xs tracking-[0.28em]">
              {isLive(featured) ? (
                <>
                  <span className="h-2 w-2 animate-pulse bg-[#ff5c2b]" />
                  <span className="text-[#ff5c2b]">LIVE NOW</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 bg-[#d8ff3c]" />
                  <span className="text-[#d8ff3c]">NEXT UP</span>
                </>
              )}
            </div>

            <div className="mt-5 flex flex-wrap items-end gap-7">
              <h2 className="m-0 max-w-[14ch] text-[clamp(38px,4.6vw,64px)] font-black uppercase leading-[0.9] tracking-[-0.04em]">
                {featured.name}
              </h2>
              <div className="pb-2 font-mono text-xs leading-[2] tracking-[0.18em] text-[#f2f0ea]/45">
                {featured.game?.toUpperCase()}
                <br />
                {featured.location?.toUpperCase()}
              </div>
            </div>

            <div className="mt-9 grid border border-[#f2f0ea]/[0.14] sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  label: "PRIZE POOL",
                  value: `${featured.prize_currency || "₹"}${(featured.prize_amount || 0).toLocaleString("en-IN")}`,
                  color: "#d8ff3c",
                },
                {
                  label: "SLOTS",
                  value: `${featured.current_participants}/${featured.max_participants}`,
                  color: isFull(featured) ? "#ff5c2b" : "#f2f0ea",
                },
                {
                  label: "WHEN",
                  value: `${dayOf(featured.tournament_date)} ${monthOf(featured.tournament_date)}${featured.tournament_time ? ` · ${featured.tournament_time}` : ""}`,
                  color: "#f2f0ea",
                },
                { label: "GAME", value: featured.game || "—", color: "#f2f0ea" },
              ].map((stat) => (
                <div key={stat.label} className="border-r border-[#f2f0ea]/10 px-5 py-[22px]">
                  <div className="whitespace-nowrap font-mono text-[11px] tracking-[0.2em] text-[#f2f0ea]/40">
                    {stat.label}
                  </div>
                  <div
                    className="mt-2.5 whitespace-nowrap text-[clamp(21px,2vw,30px)] font-black tracking-[-0.02em]"
                    style={{ color: stat.color }}
                  >
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>

            {featured.description && (
              <p className="mt-8 max-w-[62ch] font-mono text-[13px] leading-[1.9] text-[#f2f0ea]/45">
                {featured.description}
              </p>
            )}

            <div className="mt-8 flex flex-wrap gap-3.5">
              <button
                type="button"
                onClick={() => setSelected(featured)}
                className="bg-[#d8ff3c] px-9 py-[19px] font-display text-[15px] font-black tracking-[0.12em] text-[#0b0b0c] transition-[filter,transform] hover:-translate-y-0.5 hover:brightness-110"
              >
                FULL DETAILS →
              </button>
              <Link
                href="/contact"
                className="border border-[#f2f0ea]/20 px-[30px] py-[19px] font-mono text-[13px] font-semibold tracking-[0.18em] text-[#f2f0ea]/70 transition-colors hover:border-[#f2f0ea] hover:text-[#f2f0ea]"
              >
                ASK ABOUT ENTRY
              </Link>
            </div>
          </div>

          {rest.length > 0 && (
            <div className="border-t border-[#f2f0ea]/[0.12]">
              <div className="flex items-center gap-[18px] px-5 pb-4 pt-8 sm:px-8 lg:px-12">
                <span className="font-mono text-xs tracking-[0.24em] text-[#f2f0ea]/45">
                  UPCOMING SCHEDULE
                </span>
                <span className="h-px flex-1 bg-[#f2f0ea]/10" />
              </div>

              {rest.map((t) => {
                const pct =
                  t.max_participants > 0
                    ? Math.min(100, (t.current_participants / t.max_participants) * 100)
                    : 0;
                const full = isFull(t);

                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelected(t)}
                    className="grid w-full grid-cols-[64px_minmax(0,1fr)] items-center gap-x-6 gap-y-4 border-t border-[#f2f0ea]/[0.09] px-5 py-6 text-left transition-colors hover:bg-[#f2f0ea]/[0.035] sm:px-8 lg:grid-cols-[100px_minmax(0,1.25fr)_minmax(120px,1fr)_minmax(0,0.75fr)_minmax(0,0.95fr)] lg:px-12"
                  >
                    <div>
                      <div className="text-[26px] font-black leading-none tracking-[-0.02em]">
                        {dayOf(t.tournament_date)}
                      </div>
                      <div className="mt-1.5 whitespace-nowrap font-mono text-[11px] tracking-[0.18em] text-[#f2f0ea]/40">
                        {monthOf(t.tournament_date)}
                        {t.tournament_time ? ` · ${t.tournament_time}` : ""}
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="text-xl font-extrabold tracking-[-0.01em]">{t.name}</div>
                      <div className="mt-1.5 truncate font-mono text-[11px] tracking-[0.14em] text-[#f2f0ea]/40">
                        {t.location?.toUpperCase()}
                      </div>
                    </div>

                    <div className="font-mono text-xs tracking-[0.14em] text-[#f2f0ea]/55">
                      {t.game?.toUpperCase()}
                    </div>

                    <div>
                      <div className="whitespace-nowrap font-mono text-[10px] tracking-[0.18em] text-[#f2f0ea]/35">
                        PRIZE POOL
                      </div>
                      <div className="mt-1.5 whitespace-nowrap text-xl font-black tracking-[-0.02em] text-[#d8ff3c]">
                        {t.prize_currency || "₹"}
                        {(t.prize_amount || 0).toLocaleString("en-IN")}
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between gap-2.5 font-mono text-[10px] tracking-[0.16em] text-[#f2f0ea]/40">
                        <span>SLOTS</span>
                        <span
                          className="whitespace-nowrap"
                          style={{ color: full ? "#ff5c2b" : "#d8ff3c" }}
                        >
                          {t.current_participants}/{t.max_participants}
                        </span>
                      </div>
                      <div className="mt-2 h-[5px] bg-[#f2f0ea]/10">
                        <div
                          className="h-full"
                          style={{ width: `${pct}%`, background: full ? "#ff5c2b" : "#d8ff3c" }}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-6 border-t border-[#f2f0ea]/[0.09] px-5 pb-14 pt-8 sm:px-8 lg:px-12">
            <span className="max-w-[60ch] font-mono text-xs leading-[1.8] tracking-[0.16em] text-[#f2f0ea]/40">
              RUN A CAFÉ? PUT YOUR BRACKET UP HERE — TELL US ABOUT IT AND WE WILL LIST IT.
            </span>
            <Link
              href="/contact"
              className="border border-[#d8ff3c] px-7 py-4 font-mono text-xs font-semibold tracking-[0.2em] text-[#d8ff3c] transition-colors hover:bg-[#d8ff3c] hover:text-[#0b0b0c]"
            >
              HOST A TOURNAMENT
            </Link>
          </div>
        </>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-[#0b0b0c]/80 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => setSelected(null)}
        >
          <div
            className="max-h-[88vh] w-full max-w-[620px] overflow-y-auto border border-[#f2f0ea]/[0.14] bg-[#111113]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-5 border-b border-[#f2f0ea]/10 px-7 py-6">
              <div>
                <div className="font-mono text-[11px] tracking-[0.24em] text-[#d8ff3c]">
                  {selected.game?.toUpperCase()}
                </div>
                <h3 className="mt-2.5 text-2xl font-black uppercase leading-[1.05] tracking-[-0.03em]">
                  {selected.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="shrink-0 font-mono text-xs tracking-[0.18em] text-[#f2f0ea]/40 transition-colors hover:text-[#f2f0ea]"
              >
                CLOSE
              </button>
            </div>

            <div className="grid grid-cols-2 border-b border-[#f2f0ea]/10">
              {[
                {
                  k: "WHEN",
                  v: `${dayOf(selected.tournament_date)} ${monthOf(selected.tournament_date)}${selected.tournament_time ? ` · ${selected.tournament_time}` : ""}`,
                },
                { k: "WHERE", v: selected.location || "—" },
                {
                  k: "PRIZE POOL",
                  v: `${selected.prize_currency || "₹"}${(selected.prize_amount || 0).toLocaleString("en-IN")}`,
                },
                {
                  k: "SLOTS",
                  v: `${selected.current_participants}/${selected.max_participants}`,
                },
              ].map((row) => (
                <div key={row.k} className="border-b border-r border-[#f2f0ea]/[0.07] px-7 py-5">
                  <div className="font-mono text-[10px] tracking-[0.18em] text-[#f2f0ea]/35">
                    {row.k}
                  </div>
                  <div className="mt-2 text-[15px] font-extrabold">{row.v}</div>
                </div>
              ))}
            </div>

            {selected.description && (
              <p className="px-7 py-6 font-mono text-[13px] leading-[1.9] text-[#f2f0ea]/50">
                {selected.description}
              </p>
            )}

            <div className="border-t border-[#f2f0ea]/10 px-7 py-6">
              <p className="font-mono text-[11px] leading-[1.8] tracking-[0.12em] text-[#f2f0ea]/40">
                {isFull(selected)
                  ? "THIS ONE IS FULL. ASK THE CAFÉ WHETHER ANYONE DROPS OUT."
                  : "ENTRIES ARE TAKEN AT THE CAFÉ RUNNING IT — THERE IS NO ONLINE SIGN-UP YET."}
              </p>
              <Link
                href="/contact"
                className="mt-5 inline-block bg-[#d8ff3c] px-8 py-4 font-display text-[13px] font-black tracking-[0.14em] text-[#0b0b0c] transition-[filter] hover:brightness-110"
              >
                ASK ABOUT ENTRY →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
