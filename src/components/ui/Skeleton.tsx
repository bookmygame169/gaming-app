"use client";

import { colors } from "@/lib/constants";

/**
 * Placeholder blocks shaped like the content that is coming.
 *
 * A centred spinner tells someone the app is busy and nothing else. A skeleton
 * tells them what is about to appear and roughly how much of it, so the page
 * does not jump when the data lands — and it reads as faster even when it is
 * exactly as slow.
 */

export function Skeleton({
  width = "100%",
  height = 16,
  radius = 8,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="bmg-skeleton"
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  );
}

/** A card-shaped placeholder: title, two lines, and a footer row. */
export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <div
      style={{
        background: colors.darkCard,
        border: `1px solid ${colors.border}`,
        borderRadius: 16,
        padding: 16,
      }}
    >
      <Skeleton width="55%" height={18} />
      <div style={{ height: 12 }} />
      {Array.from({ length: lines }).map((_, index) => (
        <div key={index} style={{ marginBottom: 8 }}>
          {/* The last line is short, the way a wrapped paragraph ends. A stack
              of equal bars looks like a table, not like text. */}
          <Skeleton width={index === lines - 1 ? "40%" : "85%"} height={12} />
        </div>
      ))}
    </div>
  );
}

/** Several cards, for a list that is still loading. */
export function SkeletonList({ count = 3, lines = 2 }: { count?: number; lines?: number }) {
  return (
    <div style={{ display: "grid", gap: 12 }} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} lines={lines} />
      ))}
    </div>
  );
}

/**
 * The shimmer, defined once. Respects reduce-motion: a looping animation is
 * exactly the kind of thing that setting exists to switch off.
 */
export function SkeletonStyles() {
  return (
    <style jsx global>{`
      .bmg-skeleton {
        background: linear-gradient(
          90deg,
          rgba(255, 255, 255, 0.04) 25%,
          rgba(255, 255, 255, 0.09) 37%,
          rgba(255, 255, 255, 0.04) 63%
        );
        background-size: 400% 100%;
        animation: bmg-shimmer 1.4s ease infinite;
      }

      @keyframes bmg-shimmer {
        0% {
          background-position: 100% 50%;
        }
        100% {
          background-position: 0 50%;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .bmg-skeleton {
          animation: none;
          background: rgba(255, 255, 255, 0.06);
        }
      }

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
    `}</style>
  );
}
