"use client";

import { useCallback, useEffect, useState } from "react";
import { Star, Loader2, X, CheckCircle } from "lucide-react";
import { colors, fonts } from "@/lib/constants";
import { supabase } from "@/lib/supabaseClient";

type Pending = {
  bookingId: string;
  cafeId: string;
  cafeName: string;
  bookingDate: string;
};

/**
 * Asks a customer to rate a session they have already played.
 *
 * Reviews do not happen unless someone is asked: nobody navigates back to a
 * café page to leave one. This sits on the bookings list, where a customer
 * already is after a visit, and disappears once there is nothing to rate.
 */
export default function LeaveReviewPrompt() {
  const [pending, setPending] = useState<Pending[]>([]);
  const [index, setIndex] = useState(0);
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) return;

      const res = await fetch("/api/reviews/pending", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && Array.isArray(data.pending)) {
        setPending(data.pending);
      }
    } catch {
      // Nothing to show is the right outcome when this cannot be reached.
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const current = pending[index];

  const submit = async () => {
    if (!current || rating < 1) return;

    setSaving(true);
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        setError("Your session expired. Please sign in again.");
        return;
      }

      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          bookingId: current.bookingId,
          rating,
          comment: comment.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save your review");

      setJustSaved(true);

      // Move to the next unrated visit after a beat, so the thank-you is seen.
      setTimeout(() => {
        setJustSaved(false);
        setRating(0);
        setComment("");
        setIndex((prev) => prev + 1);
      }, 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your review");
    } finally {
      setSaving(false);
    }
  };

  if (dismissed || !current) return null;

  const cardStyle = {
    background: colors.darkCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  } as const;

  if (justSaved) {
    return (
      <div style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 10 }}>
        <CheckCircle size={18} color={colors.green} />
        <span style={{ fontSize: 14, color: colors.textPrimary }}>
          Thanks — that helps other gamers pick a café.
        </span>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h3
            style={{
              fontFamily: fonts.heading,
              fontSize: 15,
              fontWeight: 700,
              color: colors.textPrimary,
            }}
          >
            How was {current.cafeName}?
          </h3>
          <p style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
            Your session on{" "}
            {new Date(current.bookingDate).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
            })}
          </p>
        </div>

        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          style={{ background: "none", border: "none", color: colors.textMuted, cursor: "pointer" }}
        >
          <X size={16} />
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
        {[1, 2, 3, 4, 5].map((star) => {
          const active = star <= (hovered || rating);

          return (
            <button
              key={star}
              onClick={() => setRating(star)}
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              aria-label={`${star} star${star > 1 ? "s" : ""}`}
              style={{ background: "none", border: "none", padding: 2, cursor: "pointer" }}
            >
              <Star
                size={28}
                fill={active ? colors.orange : "none"}
                color={active ? colors.orange : colors.textMuted}
              />
            </button>
          );
        })}
      </div>

      {/* The comment box only appears once a rating is chosen: asking for
          writing up front is what stops people leaving anything at all. */}
      {rating > 0 && (
        <>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Anything you want to add? (optional)"
            maxLength={1000}
            rows={3}
            style={{
              width: "100%",
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 12,
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${colors.border}`,
              color: colors.textPrimary,
              fontSize: 13,
              fontFamily: fonts.body,
              resize: "vertical",
            }}
          />

          <button
            onClick={submit}
            disabled={saving}
            style={{
              marginTop: 12,
              padding: "10px 20px",
              borderRadius: 12,
              background: colors.cyan,
              border: "none",
              color: colors.dark,
              fontSize: 13,
              fontWeight: 700,
              cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.6 : 1,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Post review
          </button>
        </>
      )}

      {error && (
        <p style={{ fontSize: 12, color: colors.orange, marginTop: 10 }}>{error}</p>
      )}
    </div>
  );
}
