"use client";

import { useCallback, useEffect, useState } from "react";
import { CONSOLE_LABELS, colors, type ConsoleId } from "@/lib/constants";

/**
 * What is free at a café right now.
 *
 * The strongest reason to walk in is knowing there is a machine waiting. The
 * café's own lock agents already report this and nobody outside the owner
 * dashboard could see it.
 *
 * The wording follows the source. When a machine has actually reported in the
 * last few minutes this says "free right now"; when the agents are off — or
 * were never installed — it falls back to what the bookings say and words
 * itself as "not booked", which is a weaker claim and the only honest one
 * available.
 */

type ConsoleAvailability = {
  console: string;
  total: number;
  free: number;
  busy: number;
};

type Payload = {
  source: "live" | "bookings" | "none";
  consoles: ConsoleAvailability[];
};

interface LiveAvailabilityProps {
  cafeId: string;
  /** Compact fits on a café card in a list; full is for the café's own page. */
  variant?: "compact" | "full";
}

/** Re-checked while the page is open, because "right now" stops being true. */
const REFRESH_MS = 60_000;

export default function LiveAvailability({ cafeId, variant = "full" }: LiveAvailabilityProps) {
  const [data, setData] = useState<Payload | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/cafes/${encodeURIComponent(cafeId)}/live`);
      if (!res.ok) return;
      setData(await res.json());
    } catch {
      // Silent: this is a reassurance, and an error where one was expected is
      // worse than the section simply not appearing.
    }
  }, [cafeId]);

  useEffect(() => {
    // load() sets state only after `await fetch(...)`, so this is not a
    // synchronous update. The rule cannot see past the async boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();

    const timer = setInterval(load, REFRESH_MS);

    // Phones freeze timers in the background, so a page returned to after
    // twenty minutes would otherwise still be showing twenty-minute-old
    // "right now".
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  if (!data || data.source === "none" || data.consoles.length === 0) return null;

  const totalFree = data.consoles.reduce((sum, entry) => sum + entry.free, 0);
  const isLive = data.source === "live";

  if (variant === "compact") {
    if (totalFree === 0) return null;

    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          fontSize: 11,
          fontWeight: 600,
          color: colors.green,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: colors.green,
            // Only a live report gets to pulse. A booking-derived number that
            // blinks would be claiming more than it knows.
            animation: isLive ? "bmg-live-pulse 1.6s ease-in-out infinite" : "none",
          }}
        />
        {totalFree} free {isLive ? "now" : "slot" + (totalFree === 1 ? "" : "s")}
        <style jsx global>{`
          @keyframes bmg-live-pulse {
            0%,
            100% {
              opacity: 1;
            }
            50% {
              opacity: 0.35;
            }
          }
          @media (prefers-reduced-motion: reduce) {
            @keyframes bmg-live-pulse {
              0%,
              100% {
                opacity: 1;
              }
            }
          }
        `}</style>
      </span>
    );
  }

  return (
    <div
      style={{
        background: colors.darkCard,
        border: `1px solid ${totalFree > 0 ? "rgba(34,197,94,0.25)" : colors.border}`,
        borderRadius: 16,
        padding: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: totalFree > 0 ? colors.green : colors.textMuted,
            animation: isLive && totalFree > 0 ? "bmg-live-pulse 1.6s ease-in-out infinite" : "none",
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 700, color: colors.textPrimary }}>
          {totalFree > 0
            ? isLive
              ? `${totalFree} free right now`
              : `${totalFree} not booked right now`
            : "Everything is busy right now"}
        </span>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {data.consoles.map((entry) => (
          <div
            key={entry.console}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
          >
            <span style={{ fontSize: 13, color: colors.textSecondary }}>
              {CONSOLE_LABELS[entry.console as ConsoleId] || entry.console.toUpperCase()}
            </span>

            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* One pip per machine reads faster than "3/5" on a phone. */}
              <span style={{ display: "flex", gap: 3 }}>
                {Array.from({ length: Math.min(entry.total, 8) }).map((_, index) => (
                  <span
                    key={index}
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 2,
                      background: index < entry.free ? colors.green : "rgba(255,255,255,0.12)",
                    }}
                  />
                ))}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: entry.free > 0 ? colors.green : colors.textMuted,
                  minWidth: 34,
                  textAlign: "right",
                }}
              >
                {entry.free}/{entry.total}
              </span>
            </span>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 10.5, color: colors.textMuted, marginTop: 12 }}>
        {isLive
          ? "Live from the café's own machines. Updates while this page is open."
          : "Based on today's bookings — someone may still be sitting at a free-looking machine."}
      </p>
    </div>
  );
}
