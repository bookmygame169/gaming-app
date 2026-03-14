import React from 'react';
import StatCard from '../StatCard';
import { BookingsTable } from '../BookingsTable';

type OverviewTabProps = {
  isMobile: boolean;
  theme: any;
  fonts: any;
  loadingData: boolean;
  cafes: any[];
  stats: any;
  revenueFilter: string;
  setRevenueFilter: (filter: string) => void;
  bookings: any[];
  setActiveTab: (tab: string) => void;
};

// Helper function to get local date string (YYYY-MM-DD) instead of UTC
const getLocalDateString = (date: Date = new Date()): string => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export default function OverviewTab({
  isMobile,
  theme,
  fonts,
  loadingData,
  cafes,
  stats,
  revenueFilter,
  setRevenueFilter,
  bookings,
  setActiveTab
}: OverviewTabProps) {
  const [cafe] = cafes;

  return (
    <div style={{ animation: "fadeIn 0.3s ease-out" }}>
      {/* Quick Stats Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(280px, 1fr))",
          gap: isMobile ? 16 : 24,
          marginBottom: isMobile ? 16 : 24,
        }}
      >
        <StatCard
          title="Today&apos;s Revenue"
          value={`₹${loadingData ? "..." : stats?.todayRevenue ?? 0}`}
          subtitle="Total earnings today"
          icon="💵"
          gradient="linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.1))"
          color="#10b981"
        />
        <div
          onClick={() => setActiveTab('cafe-details')}
          style={{
            background: `linear-gradient(135deg, rgba(129, 140, 248, 0.15), rgba(99, 102, 241, 0.1))`,
            borderRadius: isMobile ? 12 : 16,
            padding: isMobile ? "16px" : "24px",
            border: `1px solid rgba(129, 140, 248, 0.3)`,
            position: "relative",
            overflow: "hidden",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            if (cafe) {
              e.currentTarget.style.transform = "translateY(-4px)";
              e.currentTarget.style.boxShadow = "0 8px 24px rgba(99, 102, 241, 0.2)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          <div style={{ position: "absolute", top: -20, right: -20, fontSize: isMobile ? 60 : 80, opacity: 0.1 }}>
            🏪
          </div>
          <div style={{ position: "relative", zIndex: 1 }}>
            <p
              style={{
                fontSize: isMobile ? 9 : 11,
                color: "#818cf8E6",
                marginBottom: isMobile ? 6 : 8,
                textTransform: "uppercase",
                letterSpacing: isMobile ? 1 : 1.5,
                fontWeight: 600,
              }}
            >
              My Café
            </p>
            <p
              style={{
                fontFamily: fonts.heading,
                fontSize: cafe ? (isMobile ? 16 : 20) : (isMobile ? 24 : 36),
                margin: isMobile ? "6px 0" : "8px 0",
                color: "#818cf8",
                lineHeight: 1.2,
              }}
            >
              {loadingData ? "..." : cafe?.name || (cafe ? "Your Café" : "0")}
            </p>
            <p style={{ fontSize: isMobile ? 11 : 13, color: "#818cf8B3", marginTop: isMobile ? 6 : 8 }}>
              {cafe ? "Click to manage" : "No café assigned"}
            </p>
          </div>
        </div>
        <StatCard
          title="Today&apos;s Bookings"
          value={loadingData ? "..." : stats?.bookingsToday ?? 0}
          subtitle="Sessions today"
          icon="📅"
          gradient="linear-gradient(135deg, rgba(251, 146, 60, 0.15), rgba(249, 115, 22, 0.1))"
          color="#fb923c"
        />
        <StatCard
          title="Total Bookings"
          value={loadingData ? "..." : stats?.totalBookings ?? 0}
          subtitle="All time"
          icon="📊"
          gradient="linear-gradient(135deg, rgba(168, 85, 247, 0.15), rgba(147, 51, 234, 0.1))"
          color="#a855f7"
        />
      </div>

      {/* Revenue Overview with Filters */}
      <div
        style={{
          background: theme.cardBackground,
          borderRadius: isMobile ? 12 : 16,
          border: `1px solid ${theme.border}`,
          padding: isMobile ? "16px" : "24px",
          marginBottom: isMobile ? 16 : 24,
        }}
      >
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: isMobile ? 12 : 20,
          flexWrap: "wrap",
          gap: isMobile ? 8 : 12,
        }}>
          <h2
            style={{
              fontSize: isMobile ? 14 : 18,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: isMobile ? 6 : 8,
            }}
          >
            <span style={{ fontSize: isMobile ? 16 : 20 }}>💰</span> Revenue Overview
          </h2>
          <div style={{ display: "flex", gap: isMobile ? 4 : 8, flexWrap: "wrap" }}>
            {[
              { value: "today", label: "Today" },
              { value: "week", label: "This Week" },
              { value: "month", label: "This Month" },
              { value: "quarter", label: "This Quarter" },
              { value: "all", label: "All Time" },
            ].map((filter) => (
              <button
                key={filter.value}
                onClick={() => setRevenueFilter(filter.value)}
                style={{
                  padding: isMobile ? "6px 10px" : "8px 16px",
                  borderRadius: isMobile ? 6 : 8,
                  border: `1px solid ${revenueFilter === filter.value ? "#10b981" : theme.border
                    }`,
                  background:
                    revenueFilter === filter.value
                      ? "rgba(16, 185, 129, 0.15)"
                      : "rgba(15,23,42,0.4)",
                  color: revenueFilter === filter.value ? "#10b981" : "#94a3b8",
                  fontSize: isMobile ? 11 : 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  if (revenueFilter !== filter.value) {
                    e.currentTarget.style.borderColor = "#10b98180";
                    e.currentTarget.style.background = "rgba(16, 185, 129, 0.08)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (revenueFilter !== filter.value) {
                    e.currentTarget.style.borderColor = theme.border;
                    e.currentTarget.style.background = "rgba(15,23,42,0.4)";
                  }
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(200px, 1fr))",
            gap: isMobile ? 10 : 16,
          }}
        >
          <div
            style={{
              padding: isMobile ? "14px" : "20px",
              borderRadius: isMobile ? 10 : 12,
              background: "linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.1))",
              border: "1px solid rgba(16, 185, 129, 0.3)",
            }}
          >
            <p style={{ fontSize: isMobile ? 10 : 12, color: "#10b981", marginBottom: isMobile ? 6 : 8, textTransform: "uppercase", letterSpacing: isMobile ? 0.5 : 1 }}>
              Total Revenue
            </p>
            <p style={{ fontSize: isMobile ? 22 : 32, fontWeight: 700, color: "#10b981", fontFamily: fonts.heading }}>
              ₹{loadingData ? "..." : (() => {
                const now = new Date();
                const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

                if (revenueFilter === "today") {
                  return bookings
                    .filter(b => b.booking_date === todayStr && b.status !== 'cancelled')
                    .reduce((sum, b) => sum + (b.total_amount || 0), 0);
                } else if (revenueFilter === "week") {
                  const now = new Date();
                  const startOfWeek = new Date(now);
                  startOfWeek.setDate(now.getDate() - now.getDay());
                  return bookings
                    .filter(b => new Date(b.booking_date || "") >= startOfWeek)
                    .reduce((sum, b) => sum + (b.total_amount || 0), 0);
                } else if (revenueFilter === "month") {
                  const now = new Date();
                  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                  return bookings
                    .filter(b => new Date(b.booking_date || "") >= startOfMonth)
                    .reduce((sum, b) => sum + (b.total_amount || 0), 0);
                } else if (revenueFilter === "quarter") {
                  const now = new Date();
                  const currentQuarter = Math.floor(now.getMonth() / 3);
                  const startOfQuarter = new Date(now.getFullYear(), currentQuarter * 3, 1);
                  return bookings
                    .filter(b => new Date(b.booking_date || "") >= startOfQuarter)
                    .reduce((sum, b) => sum + (b.total_amount || 0), 0);
                } else {
                  return bookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);
                }
              })()}
            </p>
            <p style={{ fontSize: isMobile ? 10 : 12, color: "#10b98180", marginTop: isMobile ? 6 : 8 }}>
              {revenueFilter === "today" ? "Today's earnings" :
                revenueFilter === "week" ? "This week's earnings" :
                  revenueFilter === "month" ? "This month's earnings" :
                    revenueFilter === "quarter" ? "This quarter's earnings" :
                      "All time earnings"}
            </p>
          </div>

          <div
            style={{
              padding: isMobile ? "14px" : "20px",
              borderRadius: isMobile ? 10 : 12,
              background: "linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(37, 99, 235, 0.1))",
              border: "1px solid rgba(59, 130, 246, 0.3)",
            }}
          >
            <p style={{ fontSize: isMobile ? 10 : 12, color: "#3b82f6", marginBottom: isMobile ? 6 : 8, textTransform: "uppercase", letterSpacing: isMobile ? 0.5 : 1 }}>
              Bookings
            </p>
            <p style={{ fontSize: isMobile ? 22 : 32, fontWeight: 700, color: "#3b82f6", fontFamily: fonts.heading }}>
              {loadingData ? "..." : (() => {
                const todayStr = getLocalDateString();

                if (revenueFilter === "today") {
                  return bookings.filter(b => b.booking_date === todayStr).length;
                } else if (revenueFilter === "week") {
                  const now = new Date();
                  const startOfWeek = new Date(now);
                  startOfWeek.setDate(now.getDate() - now.getDay());
                  return bookings.filter(b => new Date(b.booking_date || "") >= startOfWeek).length;
                } else if (revenueFilter === "month") {
                  const now = new Date();
                  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                  return bookings.filter(b => new Date(b.booking_date || "") >= startOfMonth).length;
                } else if (revenueFilter === "quarter") {
                  const now = new Date();
                  const currentQuarter = Math.floor(now.getMonth() / 3);
                  const startOfQuarter = new Date(now.getFullYear(), currentQuarter * 3, 1);
                  return bookings.filter(b => new Date(b.booking_date || "") >= startOfQuarter).length;
                } else {
                  return bookings.length;
                }
              })()}
            </p>
            <p style={{ fontSize: isMobile ? 10 : 12, color: "#3b82f680", marginTop: isMobile ? 6 : 8 }}>
              {revenueFilter === "today" ? "Today&apos;s bookings" :
                revenueFilter === "week" ? "This week's bookings" :
                  revenueFilter === "month" ? "This month's bookings" :
                    revenueFilter === "quarter" ? "This quarter's bookings" :
                      "All time bookings"}
            </p>
          </div>

          <div
            style={{
              padding: isMobile ? "14px" : "20px",
              borderRadius: isMobile ? 10 : 12,
              background: "linear-gradient(135deg, rgba(249, 115, 22, 0.15), rgba(234, 88, 12, 0.1))",
              border: "1px solid rgba(249, 115, 22, 0.3)",
            }}
          >
            <p style={{ fontSize: isMobile ? 10 : 12, color: "#f97316", marginBottom: isMobile ? 6 : 8, textTransform: "uppercase", letterSpacing: isMobile ? 0.5 : 1 }}>
              Avg per Booking
            </p>
            <p style={{ fontSize: isMobile ? 22 : 32, fontWeight: 700, color: "#f97316", fontFamily: fonts.heading }}>
              ₹{loadingData ? "..." : (() => {
                const todayStr = getLocalDateString();
                let revenue = 0;
                let count = 0;

                if (revenueFilter === "today") {
                  const todayBookings = bookings.filter(b => b.booking_date === todayStr);
                  revenue = todayBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);
                  count = todayBookings.length;
                } else if (revenueFilter === "week") {
                  const now = new Date();
                  const startOfWeek = new Date(now);
                  startOfWeek.setDate(now.getDate() - now.getDay());
                  const weekBookings = bookings.filter(b => new Date(b.booking_date || "") >= startOfWeek);
                  revenue = weekBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);
                  count = weekBookings.length;
                } else if (revenueFilter === "month") {
                  const now = new Date();
                  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                  const monthBookings = bookings.filter(b => new Date(b.booking_date || "") >= startOfMonth);
                  revenue = monthBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);
                  count = monthBookings.length;
                } else if (revenueFilter === "quarter") {
                  const now = new Date();
                  const currentQuarter = Math.floor(now.getMonth() / 3);
                  const startOfQuarter = new Date(now.getFullYear(), currentQuarter * 3, 1);
                  const quarterBookings = bookings.filter(b => new Date(b.booking_date || "") >= startOfQuarter);
                  revenue = quarterBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);
                  count = quarterBookings.length;
                } else {
                  revenue = bookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);
                  count = bookings.length;
                }

                return count > 0 ? Math.round(revenue / count) : 0;
              })()}
            </p>
            <p style={{ fontSize: isMobile ? 10 : 12, color: "#f9731680", marginTop: isMobile ? 6 : 8 }}>
              Average revenue per booking
            </p>
          </div>
        </div>
      </div>

      {/* Daily Earnings - Last 30 Days */}
      <div
        style={{
          background: theme.cardBackground,
          borderRadius: isMobile ? 12 : 16,
          border: `1px solid ${theme.border}`,
          padding: isMobile ? "16px" : "24px",
          marginBottom: isMobile ? 16 : 24,
        }}
      >
        <h2
          style={{
            fontSize: isMobile ? 14 : 18,
            fontWeight: 600,
            marginBottom: isMobile ? 12 : 16,
            display: "flex",
            alignItems: "center",
            gap: isMobile ? 6 : 10,
          }}
        >
          <span style={{ fontSize: isMobile ? 16 : 20 }}>📊</span>
          {isMobile ? "Daily Earnings" : "Daily Earnings - Last 30 Days"}
        </h2>

        <div
          style={{
            overflowX: "auto",
            maxHeight: "500px",
            overflowY: "auto",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
            }}
          >
            <thead
              style={{
                position: "sticky",
                top: 0,
                background: "rgba(15,23,42,0.95)",
                zIndex: 1,
              }}
            >
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    padding: "12px 16px",
                    borderBottom: `1px solid ${theme.border}`,
                    fontSize: 13,
                    color: "#94a3b8",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Date
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "12px 16px",
                    borderBottom: `1px solid ${theme.border}`,
                    fontSize: 13,
                    color: "#94a3b8",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Bookings
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "12px 16px",
                    borderBottom: `1px solid ${theme.border}`,
                    fontSize: 13,
                    color: "#94a3b8",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Revenue
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "12px 16px",
                    borderBottom: `1px solid ${theme.border}`,
                    fontSize: 13,
                    color: "#94a3b8",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Avg/Booking
                </th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                // Generate last 30 days
                const last30Days = [];
                const today = new Date();
                for (let i = 0; i < 30; i++) {
                  const date = new Date(today);
                  date.setDate(today.getDate() - i);
                  const dateStr = getLocalDateString(date);

                  // Calculate bookings and revenue for this date
                  const dayBookings = bookings.filter(b => b.booking_date === dateStr);
                  const dayRevenue = dayBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);
                  const avgRevenue = dayBookings.length > 0 ? Math.round(dayRevenue / dayBookings.length) : 0;

                  // Format date nicely
                  const isToday = i === 0;
                  const isYesterday = i === 1;
                  const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                  const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

                  let dateLabel = formattedDate;
                  if (isToday) dateLabel = `Today (${formattedDate})`;
                  if (isYesterday) dateLabel = `Yesterday (${formattedDate})`;

                  last30Days.push({
                    date: dateStr,
                    dateLabel,
                    dayName,
                    bookingsCount: dayBookings.length,
                    revenue: dayRevenue,
                    avgRevenue,
                    isToday,
                    isYesterday,
                  });
                }

                return last30Days.map((day, idx) => (
                  <tr
                    key={day.date}
                    style={{
                      borderBottom: `1px solid ${theme.border}40`,
                      background: day.isToday ? "rgba(16, 185, 129, 0.05)" : "transparent",
                      transition: "background 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!day.isToday) {
                        e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!day.isToday) {
                        e.currentTarget.style.background = "transparent";
                      }
                    }}
                  >
                    <td
                      style={{
                        padding: "14px 16px",
                        fontSize: 14,
                        color: day.isToday ? "#10b981" : "#e2e8f0",
                        fontWeight: day.isToday ? 600 : 400,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          fontSize: 11,
                          color: "#64748b",
                          minWidth: 30,
                          textAlign: "center",
                          background: "rgba(255,255,255,0.05)",
                          padding: "2px 6px",
                          borderRadius: 4,
                        }}>
                          {day.dayName}
                        </span>
                        {day.dateLabel}
                      </div>
                    </td>
                    <td
                      style={{
                        padding: "14px 16px",
                        fontSize: 14,
                        color: day.bookingsCount > 0 ? "#3b82f6" : "#64748b",
                        textAlign: "right",
                        fontWeight: day.bookingsCount > 0 ? 600 : 400,
                      }}
                    >
                      {day.bookingsCount > 0 ? day.bookingsCount : "-"}
                    </td>
                    <td
                      style={{
                        padding: "14px 16px",
                        fontSize: 14,
                        color: day.revenue > 0 ? "#10b981" : "#64748b",
                        textAlign: "right",
                        fontWeight: day.revenue > 0 ? 600 : 400,
                      }}
                    >
                      {day.revenue > 0 ? `₹${day.revenue}` : "-"}
                    </td>
                    <td
                      style={{
                        padding: "14px 16px",
                        fontSize: 14,
                        color: day.avgRevenue > 0 ? "#f97316" : "#64748b",
                        textAlign: "right",
                      }}
                    >
                      {day.avgRevenue > 0 ? `₹${day.avgRevenue}` : "-"}
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        <div
          style={{
            marginTop: 20,
            paddingTop: 20,
            borderTop: `1px solid ${theme.border}`,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 16,
          }}
        >
          <div>
            <p style={{ fontSize: 11, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
              Total (30 Days)
            </p>
            <p style={{ fontSize: 20, fontWeight: 700, color: "#10b981" }}>
              ₹{(() => {
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                return bookings
                  .filter(b => new Date(b.booking_date || "") >= thirtyDaysAgo)
                  .reduce((sum, b) => sum + (b.total_amount || 0), 0);
              })()}
            </p>
          </div>
          <div>
            <p style={{ fontSize: 11, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
              Total Bookings
            </p>
            <p style={{ fontSize: 20, fontWeight: 700, color: "#3b82f6" }}>
              {(() => {
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                return bookings.filter(b => new Date(b.booking_date || "") >= thirtyDaysAgo).length;
              })()}
            </p>
          </div>
          <div>
            <p style={{ fontSize: 11, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
              Daily Average
            </p>
            <p style={{ fontSize: 20, fontWeight: 700, color: "#f97316" }}>
              ₹{(() => {
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                const total = bookings
                  .filter(b => new Date(b.booking_date || "") >= thirtyDaysAgo)
                  .reduce((sum, b) => sum + (b.total_amount || 0), 0);
                return Math.round(total / 30);
              })()}
            </p>
          </div>
          <div>
            <p style={{ fontSize: 11, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
              Peak Day
            </p>
            <p style={{ fontSize: 20, fontWeight: 700, color: "#a855f7" }}>
              ₹{(() => {
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                const recentBookings = bookings.filter(b => new Date(b.booking_date || "") >= thirtyDaysAgo);

                // Group by date
                const dailyRevenue: Record<string, number> = {};
                recentBookings.forEach(b => {
                  const date = b.booking_date || "";
                  dailyRevenue[date] = (dailyRevenue[date] || 0) + (b.total_amount || 0);
                });

                // Find max
                const maxRevenue = Math.max(...Object.values(dailyRevenue), 0);
                return maxRevenue;
              })()}
            </p>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div style={{ marginBottom: 24 }}>
        <BookingsTable
          title="Recent Bookings"
          bookings={bookings}
          limit={5}
          loading={loadingData}
          onViewAll={() => setActiveTab('bookings')}
        />
      </div>
    </div>
  );
}
