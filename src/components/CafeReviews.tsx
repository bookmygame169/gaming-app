"use client";

import { useCallback, useEffect, useState } from "react";
import { Star, Loader2, MessageSquare } from "lucide-react";
import { colors, fonts } from "@/lib/constants";

type Review = {
  id: string;
  rating: number;
  comment: string | null;
  name: string;
  ownerReply: string | null;
  ownerRepliedAt: string | null;
  createdAt: string;
};

type Summary = {
  average: number;
  count: number;
  distribution: [number, number, number, number, number];
};

interface CafeReviewsProps {
  cafeId: string;
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { month: "short", year: "numeric" });

export function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span style={{ display: "inline-flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          // Half stars are not worth the complexity here; a filled star at or
          // below the rounded average reads the same to anyone scanning.
          fill={n <= Math.round(rating) ? colors.orange : "none"}
          color={n <= Math.round(rating) ? colors.orange : colors.textMuted}
        />
      ))}
    </span>
  );
}

/**
 * Ratings and reviews for one café.
 *
 * Loaded on the client rather than server-rendered with the rest of the page:
 * reviews are the slowest-changing thing here and the least worth blocking the
 * café's photos and prices on.
 */
export default function CafeReviews({ cafeId }: CafeReviewsProps) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/reviews?cafeId=${encodeURIComponent(cafeId)}`);
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setSummary(data.summary ?? null);
        setReviews(Array.isArray(data.reviews) ? data.reviews : []);
      }
    } catch {
      // A café page should still be usable when reviews cannot be reached.
    } finally {
      setLoading(false);
    }
  }, [cafeId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "24px 0", color: colors.textMuted }}>
        <Loader2 size={16} className="animate-spin" />
        <span style={{ fontSize: 13 }}>Loading reviews…</span>
      </div>
    );
  }

  const visible = showAll ? reviews : reviews.slice(0, 4);
  const total = summary?.count ?? 0;

  return (
    <section>
      <h2
        style={{
          fontFamily: fonts.heading,
          fontSize: 20,
          fontWeight: 700,
          color: colors.textPrimary,
          marginBottom: 16,
        }}
      >
        Reviews
      </h2>

      {total === 0 ? (
        <div
          style={{
            background: colors.darkCard,
            border: `1px solid ${colors.border}`,
            borderRadius: 16,
            padding: 20,
            fontSize: 13,
            color: colors.textSecondary,
          }}
        >
          No reviews yet. Play a session here and you can be the first.
        </div>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 20,
              background: colors.darkCard,
              border: `1px solid ${colors.border}`,
              borderRadius: 16,
              padding: 20,
              marginBottom: 16,
            }}
          >
            <div style={{ textAlign: "center", minWidth: 90 }}>
              <div style={{ fontSize: 36, fontWeight: 700, color: colors.textPrimary, lineHeight: 1 }}>
                {summary!.average.toFixed(1)}
              </div>
              <div style={{ marginTop: 6 }}>
                <Stars rating={summary!.average} size={13} />
              </div>
              <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>
                {total} {total === 1 ? "review" : "reviews"}
              </div>
            </div>

            {/* The spread matters as much as the average: four 5s and one 1
                is a different café from five 4s. */}
            <div style={{ flex: 1, minWidth: 160 }}>
              {[5, 4, 3, 2, 1].map((star) => {
                const count = summary!.distribution[star - 1];
                const pct = total > 0 ? (count / total) * 100 : 0;

                return (
                  <div key={star} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: colors.textMuted, width: 12 }}>{star}</span>
                    <Star size={10} fill={colors.orange} color={colors.orange} />
                    <div
                      style={{
                        flex: 1,
                        height: 5,
                        borderRadius: 999,
                        background: "rgba(255,255,255,0.08)",
                        overflow: "hidden",
                      }}
                    >
                      <div style={{ width: `${pct}%`, height: "100%", background: colors.orange }} />
                    </div>
                    <span style={{ fontSize: 11, color: colors.textMuted, width: 20, textAlign: "right" }}>
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {visible.map((review) => (
              <div
                key={review.id}
                style={{
                  background: colors.darkCard,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 16,
                  padding: 16,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Stars rating={review.rating} size={13} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>
                      {review.name}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: colors.textMuted }}>
                    {formatDate(review.createdAt)}
                  </span>
                </div>

                {review.comment && (
                  <p style={{ fontSize: 13, color: colors.textSecondary, marginTop: 10, lineHeight: 1.6 }}>
                    {review.comment}
                  </p>
                )}

                {review.ownerReply && (
                  <div
                    style={{
                      marginTop: 12,
                      paddingLeft: 12,
                      borderLeft: `2px solid ${colors.cyan}`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <MessageSquare size={11} color={colors.cyan} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: colors.cyan }}>
                        Reply from the café
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 1.6 }}>
                      {review.ownerReply}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {reviews.length > 4 && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              style={{
                marginTop: 12,
                width: "100%",
                padding: "10px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${colors.border}`,
                color: colors.textPrimary,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Show all {reviews.length} reviews
            </button>
          )}
        </>
      )}
    </section>
  );
}
