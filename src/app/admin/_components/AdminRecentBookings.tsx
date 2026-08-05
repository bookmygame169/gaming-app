// src/app/admin/_components/AdminRecentBookings.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { colors, fonts } from "@/lib/constants";

type BookingRow = {
  id: string;
  cafe_id: string | null;
  user_id: string | null;
  booking_date: string | null;
  start_time: string | null;
  total_amount: number | null;
  status: string | null;
  source: string | null;
  created_at: string | null;
};

export default function AdminRecentBookings() {
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "confirmed" | "pending" | "cancelled">("all");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        // Last 20 bookings, latest first
        const { data, error } = await supabase
          .from("bookings")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20);

        if (error) {
          console.error("[AdminRecentBookings] Supabase error:", error);
          if (!cancelled) setError(error.message || "Could not load bookings.");
          return;
        }

        if (!cancelled) {
          setRows((data as BookingRow[]) ?? []);
        }
      } catch (err) {
        console.error("[AdminRecentBookings] Unexpected error:", err);
        if (!cancelled) {
          setError("Could not load bookings. Please try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ===== UI STATES =====

  if (loading) {
    return (
      <div
        style={{
          marginTop: 18,
          padding: "14px 16px",
          borderRadius: 16,
          background: colors.darkerCard,
          border: `1px solid ${colors.border}`,
          color: colors.textSecondary,
          fontFamily: fonts.body,
          fontSize: 13,
        }}
      >
        Loading recent bookings…
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          marginTop: 18,
          padding: "14px 16px",
          borderRadius: 16,
          border: "1px solid rgba(248,113,113,0.6)",
          background: "rgba(248,113,113,0.08)",
          color: "#fecaca",
          fontSize: 13,
          fontFamily: fonts.body,
        }}
      >
        {error}
      </div>
    );
  }

  // Filter bookings
  const filteredRows = rows.filter((booking) => {
    const matchesStatus =
      filterStatus === "all" ||
      (booking.status || "confirmed").toLowerCase() === filterStatus;

    return matchesStatus;
  });

  if (!rows.length) {
    return (
      <div
        style={{
          padding: "40px 20px",
          borderRadius: 16,
          background: colors.darkCard,
          border: `1px solid ${colors.border}`,
          color: colors.textSecondary,
          fontFamily: fonts.body,
          fontSize: 14,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>📅</div>
        <p style={{ margin: 0, color: colors.textPrimary, fontSize: 16, marginBottom: 8 }}>
          No bookings yet
        </p>
        <p style={{ margin: 0, fontSize: 13 }}>
          Once players start booking cafés, you&apos;ll see them listed here.
        </p>
      </div>
    );
  }

  // ===== MAIN TABLE =====

  return (
    <section
      style={{
        padding: "24px",
        borderRadius: 16,
        background: colors.darkCard,
        border: `1px solid ${colors.border}`,
        fontFamily: fonts.body,
      }}
    >
      {/* Header */}
      <div
        style={{
          marginBottom: 20,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 18,
              fontFamily: fonts.heading,
              color: colors.textPrimary,
              marginBottom: 6,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            📅 Recent Bookings
            <span
              style={{
                fontSize: 12,
                fontWeight: 400,
                color: colors.textMuted,
                background: colors.darkerCard,
                padding: "4px 10px",
                borderRadius: 999,
              }}
            >
              {filteredRows.length} of {rows.length}
            </span>
          </h2>
          <p
            style={{
              fontSize: 13,
              color: colors.textSecondary,
              margin: 0,
            }}
          >
            Monitor and track the latest bookings across all cafés
          </p>
        </div>
      </div>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        {/* Status Filter */}
        <div>
          <p
            style={{
              fontSize: 11,
              color: colors.textMuted,
              marginBottom: 8,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Status
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(["all", "confirmed", "pending", "cancelled"] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: `1px solid ${filterStatus === status ? colors.purple : colors.border}`,
                  background: filterStatus === status ? "rgba(168,85,247,0.15)" : colors.darkerCard,
                  color: filterStatus === status ? colors.purple : colors.textSecondary,
                  fontSize: 12,
                  fontWeight: filterStatus === status ? 600 : 400,
                  cursor: "pointer",
                  textTransform: "capitalize",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  if (filterStatus !== status) {
                    e.currentTarget.style.borderColor = colors.textMuted;
                  }
                }}
                onMouseLeave={(e) => {
                  if (filterStatus !== status) {
                    e.currentTarget.style.borderColor = colors.border;
                  }
                }}
              >
                {status === "all" ? `All (${rows.length})` : status}
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* No results */}
      {filteredRows.length === 0 && (
        <div
          style={{
            padding: "40px 20px",
            textAlign: "center",
            color: colors.textSecondary,
            fontSize: 14,
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.5 }}>🔍</div>
          <p style={{ margin: 0 }}>No bookings match the selected filters</p>
        </div>
      )}

      {filteredRows.length > 0 && (
        <div
          style={{
            width: "100%",
            overflowX: "auto",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
            }}
          >
            <thead>
              <tr
                style={{
                  textAlign: "left",
                  color: colors.textMuted,
                  borderBottom: `2px solid ${colors.border}`,
                }}
              >
                <th style={{ padding: "14px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Booking ID</th>
                <th style={{ padding: "14px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Café</th>
                <th style={{ padding: "14px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Date & Time</th>
                <th style={{ padding: "14px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Source</th>
                <th style={{ padding: "14px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Status</th>
                <th style={{ padding: "14px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((b) => {
                const status = (b.status || "confirmed").toLowerCase();
                const source = (b.source || "online").toLowerCase();
                const statusColor =
                  status === "cancelled"
                    ? "#ef4444"
                    : status === "pending"
                    ? colors.orange
                    : colors.green;

                return (
                  <tr
                    key={b.id}
                    style={{
                      borderBottom: `1px solid ${colors.border}`,
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(148,163,184,0.03)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <td style={{ padding: "14px 12px" }}>
                      <div
                        style={{
                          fontSize: 13,
                          color: colors.textPrimary,
                          fontWeight: 600,
                          marginBottom: 4,
                          fontFamily: "monospace",
                        }}
                      >
                        #{b.id.slice(0, 10).toUpperCase()}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: colors.textMuted,
                          fontFamily: "monospace",
                        }}
                      >
                        👤 {b.user_id ? b.user_id.slice(0, 8) + "…" : "-"}
                      </div>
                    </td>

                    <td
                      style={{
                        padding: "14px 12px",
                        fontSize: 11,
                        color: colors.textMuted,
                        fontFamily: "monospace",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        🏪 {b.cafe_id ? b.cafe_id.slice(0, 10) + "…" : "-"}
                      </div>
                    </td>

                    <td style={{ padding: "14px 12px" }}>
                      <div
                        style={{
                          fontSize: 13,
                          color: colors.textPrimary,
                          marginBottom: 4,
                        }}
                      >
                        {b.booking_date
                          ? new Date(`${b.booking_date}T00:00:00`).toLocaleDateString(
                              "en-IN",
                              { day: "2-digit", month: "short", year: "numeric" }
                            )
                          : "-"}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: colors.textSecondary,
                        }}
                      >
                        🕒 {b.start_time || "-"}
                      </div>
                    </td>

                    <td style={{ padding: "14px 12px" }}>
                      <span
                        style={{
                          padding: "6px 12px",
                          borderRadius: 999,
                          fontSize: 11,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                          fontWeight: 600,
                          background:
                            source === "walk_in"
                              ? "rgba(245,158,11,0.15)"
                              : "rgba(0,240,255,0.15)",
                          color:
                            source === "walk_in" ? colors.orange : colors.cyan,
                          border: `1px solid ${
                            source === "walk_in"
                              ? "rgba(245,158,11,0.3)"
                              : "rgba(0,240,255,0.3)"
                          }`,
                        }}
                      >
                        {source === "walk_in" ? "🚶 Walk-in" : "💻 Online"}
                      </span>
                    </td>

                    <td style={{ padding: "14px 12px" }}>
                      <span
                        style={{
                          padding: "6px 12px",
                          borderRadius: 999,
                          fontSize: 11,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                          fontWeight: 600,
                          background: colors.darkerCard,
                          border: `1px solid ${statusColor}`,
                          color: statusColor,
                        }}
                      >
                        {status === "confirmed" && "✓ "}
                        {status === "cancelled" && "✗ "}
                        {status === "pending" && "⏱ "}
                        {status}
                      </span>
                    </td>

                    <td
                      style={{
                        padding: "14px 12px",
                        textAlign: "right",
                      }}
                    >
                      <div
                        style={{
                          fontFamily: fonts.heading,
                          fontSize: 16,
                          color: colors.green,
                          fontWeight: 600,
                        }}
                      >
                        ₹{b.total_amount ?? 0}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}