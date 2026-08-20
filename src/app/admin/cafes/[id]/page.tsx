// src/app/admin/cafes/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { colors, fonts } from "@/lib/constants";
import { fetchAdminCafeBookings } from "@/app/admin/adminLookup";

type CafeRow = {
  id: string;
  name: string | null;
  city: string | null;
  created_at: string | null;
};

type BookingRow = {
  id: string;
  cafe_id: string | null;
  booking_date: string | null;
  start_time: string | null;
  total_amount: number | null;
  status: string | null;
  source: string | null;
  created_at: string | null;
};

export default function AdminCafeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const cafeId = params?.id;

  const [cafe, setCafe] = useState<CafeRow | null>(null);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookingsError, setBookingsError] = useState<string | null>(null);

  useEffect(() => {
    if (!cafeId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setBookingsError(null);

      // 1) Load café details (NO owner_id now)
      const { data: cafeRow, error: cafeError } = await supabase
        .from("cafes")
        .select("id, name, city, created_at")
        .eq("id", cafeId)
        .maybeSingle();

      if (cafeError) {
        console.error("[AdminCafeDetail] cafe error:", cafeError);
        if (!cancelled) {
          setError(
            cafeError.message || "Could not load café details from database."
          );
          setLoading(false);
        }
        return;
      }

      if (!cafeRow) {
        if (!cancelled) {
          setError("Café not found.");
          setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setCafe(cafeRow as CafeRow);
      }

      // 2) Load bookings for this café, through the server: the browser can
      //    no longer read this table directly, and should never have been able
      //    to read every café's.
      const bookingRows = await fetchAdminCafeBookings<BookingRow>(cafeId);
      if (!cancelled) {
        setBookings(bookingRows);
      }

      if (!cancelled) setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [cafeId]);

  const stats = useMemo(() => {
    const totalBookings = bookings.length;
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayBookings = bookings.filter(
      (b) => (b.booking_date ?? "").slice(0, 10) === todayStr
    ).length;
    const totalRevenue = bookings.reduce(
      (sum, b) => sum + (b.total_amount ?? 0),
      0
    );
    return { totalBookings, todayBookings, totalRevenue };
  }, [bookings]);

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "-";
    }
  }

  // ===== STATES =====

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: colors.dark,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: fonts.body,
          color: colors.textSecondary,
        }}
      >
        Loading café details…
      </div>
    );
  }

  if (error || !cafe) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: colors.dark,
          fontFamily: fonts.body,
          color: colors.textPrimary,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div>
          <p style={{ fontSize: 40, marginBottom: 12 }}>😕</p>
          <p
            style={{
              fontFamily: fonts.heading,
              fontSize: 18,
              marginBottom: 8,
            }}
          >
            {error || "Could not load café details."}
          </p>
          <button
            onClick={() => router.push("/admin")}
            style={{
              marginTop: 8,
              padding: "10px 18px",
              borderRadius: 999,
              border: "none",
              background:
                "linear-gradient(135deg, #ef4444 0%, #fb7185 100%)",
              color: "white",
              fontFamily: fonts.heading,
              fontSize: 12,
              letterSpacing: 1,
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Back to admin
          </button>
        </div>
      </div>
    );
  }

  // ===== MAIN UI =====

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `radial-gradient(circle at top, #1e1b4b 0, #050509 45%)`,
        fontFamily: fonts.body,
        color: colors.textPrimary,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "20px 20px 60px",
        }}
      >
        {/* Top bar */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 24,
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <button
              onClick={() => router.push("/admin")}
              style={{
                border: "none",
                background: "transparent",
                color: colors.textSecondary,
                fontSize: 12,
                marginBottom: 4,
                cursor: "pointer",
              }}
            >
              ← Back to admin
            </button>
            <p
              style={{
                fontSize: 11,
                letterSpacing: 3,
                textTransform: "uppercase",
                color: colors.textMuted,
                marginBottom: 4,
              }}
            >
              Café Overview
            </p>
            <h1
              style={{
                fontFamily: fonts.heading,
                fontSize: 22,
                margin: 0,
              }}
            >
              {cafe.name || "Untitled café"}
            </h1>
            <p
              style={{
                fontSize: 12,
                color: colors.textSecondary,
                marginTop: 4,
              }}
            >
              {cafe.city || "City not set"} · ID {cafe.id.slice(0, 8)}…
            </p>
          </div>

          <div
            style={{
              textAlign: "right",
              fontSize: 11,
              color: colors.textMuted,
            }}
          >
            <div>Created</div>
            <div style={{ color: colors.textSecondary }}>
              {formatDate(cafe.created_at)}
            </div>
          </div>
        </header>

        {/* Stats for this café */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              padding: "18px 18px",
              borderRadius: 16,
              background: colors.darkerCard,
              border: `1px solid ${colors.border}`,
            }}
          >
            <p
              style={{
                fontSize: 11,
                color: colors.textMuted,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 6,
              }}
            >
              Total Bookings
            </p>
            <p
              style={{
                fontFamily: fonts.heading,
                fontSize: 28,
                margin: 0,
              }}
            >
              {stats.totalBookings}
            </p>
          </div>

          <div
            style={{
              padding: "18px 18px",
              borderRadius: 16,
              background: colors.darkerCard,
              border: `1px solid ${colors.border}`,
            }}
          >
            <p
              style={{
                fontSize: 11,
                color: colors.textMuted,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 6,
              }}
            >
              Today’s Bookings
            </p>
            <p
              style={{
                fontFamily: fonts.heading,
                fontSize: 28,
                margin: 0,
              }}
            >
              {stats.todayBookings}
            </p>
          </div>

          <div
            style={{
              padding: "18px 18px",
              borderRadius: 16,
              background:
                "linear-gradient(135deg, rgba(34,197,94,0.2), rgba(15,23,42,0.9))",
              border: `1px solid rgba(34,197,94,0.5)`,
            }}
          >
            <p
              style={{
                fontSize: 11,
                color: "rgba(209,250,229,0.9)",
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 6,
              }}
            >
              Total Revenue
            </p>
            <p
              style={{
                fontFamily: fonts.heading,
                fontSize: 28,
                margin: 0,
                color: "#bbf7d0",
              }}
            >
              ₹{stats.totalRevenue}
            </p>
          </div>
        </section>

        {/* If bookings query failed, show a small warning */}
        {bookingsError && (
          <div
            style={{
              marginBottom: 16,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(248,113,113,0.6)",
              background: "rgba(248,113,113,0.08)",
              fontSize: 12,
              color: "#fecaca",
            }}
          >
            {bookingsError}
          </div>
        )}

        {/* Bookings table */}
        <section
          style={{
            borderRadius: 18,
            background: colors.darkCard,
            border: `1px solid ${colors.border}`,
            padding: "18px 18px 12px",
          }}
        >
          <div
            style={{
              marginBottom: 10,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <p
                style={{
                  fontSize: 11,
                  color: colors.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: 2,
                  marginBottom: 4,
                }}
              >
                Bookings
              </p>
              <p
                style={{
                  fontSize: 12,
                  color: colors.textSecondary,
                }}
              >
                All bookings for this café
              </p>
            </div>
          </div>

          {bookings.length === 0 ? (
            <div
              style={{
                padding: "40px 20px",
                textAlign: "center",
                color: colors.textSecondary,
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
              No bookings yet for this café.
            </div>
          ) : (
            <div
              style={{
                marginTop: 4,
                borderRadius: 14,
                overflow: "hidden",
                border: `1px solid ${colors.border}`,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.6fr 1.4fr 1.4fr 1.4fr 1.4fr",
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  color: colors.textMuted,
                  background: "rgba(15,23,42,0.9)",
                  padding: "10px 14px",
                }}
              >
                <span>Date</span>
                <span>Time</span>
                <span>Status</span>
                <span>Source</span>
                <span style={{ textAlign: "right" }}>Amount</span>
              </div>

              {bookings.map((b, idx) => {
                const status = (b.status || "confirmed").toLowerCase();
                const isCancelled = status === "cancelled";
                const isPending = status === "pending";

                const statusColor = isCancelled
                  ? "#fecaca"
                  : isPending
                  ? colors.orange
                  : colors.green;

                const statusBg = isCancelled
                  ? "rgba(248,113,113,0.2)"
                  : isPending
                  ? "rgba(251,191,36,0.15)"
                  : "rgba(34,197,94,0.2)";

                const source = (b.source || "online").toLowerCase();

                return (
                  <div
                    key={b.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "1.6fr 1.4fr 1.4fr 1.4fr 1.4fr",
                      padding: "10px 14px",
                      fontSize: 13,
                      background:
                        idx % 2 === 0
                          ? "rgba(15,23,42,0.85)"
                          : "rgba(15,23,42,0.75)",
                      borderTop: `1px solid rgba(15,23,42,0.95)`,
                    }}
                  >
                    <span>{formatDate(b.booking_date)}</span>
                    <span
                      style={{
                        color: colors.cyan,
                        fontWeight: 500,
                      }}
                    >
                      {b.start_time || "-"}
                    </span>
                    <span>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "2px 8px",
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 600,
                          letterSpacing: 0.5,
                          color: statusColor,
                          background: statusBg,
                        }}
                      >
                        {status.toUpperCase()}
                      </span>
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: colors.textSecondary,
                      }}
                    >
                      {source === "walk_in" ? "Walk-in" : "Online"}
                    </span>
                    <span
                      style={{
                        textAlign: "right",
                        fontFamily: fonts.heading,
                        fontSize: 14,
                      }}
                    >
                      ₹{b.total_amount ?? 0}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}