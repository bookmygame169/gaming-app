"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { colors, fonts, CONSOLE_LABELS, CONSOLE_ICONS, CONSOLE_COLORS } from "@/lib/constants";
import type { ConsoleId } from "@/lib/constants";
import type {
  ConsoleAvailability,
  ConsolePricingTier,
  DayOption,
  TimeSlot,
} from "@/types/booking";
import { fetchLiveAvailability } from "@/lib/availabilityService";
import { generateTickets } from "@/lib/ticketService";
import { getOpeningWindow, type OpeningWindow } from "@/lib/openingHours";
import {
  DatePicker,
  TimeSlotGrid,
  DurationSelector,
  ConsoleGrid,
  BookingBottomBar,
  type ConsoleCardData,
} from "@/components/booking";
import { Loader2, Minus, Plus, ArrowLeft } from "lucide-react";

/**
 * The customer booking flow.
 *
 * The components, services and types for this were all written, along with the
 * checkout page, but nothing ever assembled them — so /checkout waited for a
 * draft in sessionStorage that nothing created, and there was no way to book
 * from the site at all. This is the page that connects them.
 */

type CafeRow = {
  id: string;
  name: string;
  hourly_price: number | null;
  ps5_count: number | null;
  ps4_count: number | null;
  xbox_count: number | null;
  pc_count: number | null;
  pool_count: number | null;
  snooker_count: number | null;
  arcade_count: number | null;
  vr_count: number | null;
  steering_wheel_count: number | null;
  racing_sim_count: number | null;
  opening_hours: string | null;
};

/** Which cafe column holds the count for each console. */
const COUNT_FIELD: Record<string, keyof CafeRow> = {
  ps5: "ps5_count",
  ps4: "ps4_count",
  xbox: "xbox_count",
  pc: "pc_count",
  pool: "pool_count",
  snooker: "snooker_count",
  arcade: "arcade_count",
  vr: "vr_count",
  steering: "steering_wheel_count",
  racing_sim: "racing_sim_count",
};

const DAYS_AHEAD = 7;

/** India local date, since bookings are stored as café-local dates. */
function indiaDateString(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function buildDays(): DayOption[] {
  const today = new Date();
  const todayKey = indiaDateString(today);

  return Array.from({ length: DAYS_AHEAD }, (_, offset) => {
    const date = new Date(today);
    date.setDate(date.getDate() + offset);
    const key = indiaDateString(date);

    return {
      key,
      dayName: date.toLocaleDateString("en-IN", { weekday: "short" }),
      dayNum: String(date.getDate()),
      month: date.toLocaleDateString("en-IN", { month: "short" }),
      isToday: key === todayKey,
    };
  });
}

/** Shortest session on offer. A slot with less than this left before closing
 *  is not worth showing. */
const MIN_SESSION_MINUTES = 30;

/**
 * Half-hour slots across the café's own opening hours.
 *
 * These used to be hardcoded 10am–11pm regardless of the café. A venue open
 * until 2am lost its busiest hours, and one opening at noon offered slots it
 * could not honour.
 *
 * Slots already gone are dropped for today, so someone cannot book a session
 * that started an hour ago.
 */
function buildSlots(dateKey: string, window: OpeningWindow): TimeSlot[] {
  const now = new Date();
  const isToday = dateKey === indiaDateString(now);

  const nowMinutes = isToday
    ? (() => {
        const parts = new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Kolkata",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(now);
        const [h, m] = parts.split(":").map(Number);
        return h * 60 + m;
      })()
    : -1;

  const slots: TimeSlot[] = [];
  const lastStart = window.closeMinutes - MIN_SESSION_MINUTES;

  for (let start = window.openMinutes; start <= lastStart; start += 30) {
    // Past midnight the clock has wrapped, but the slot still belongs to this
    // café-day: 1:00 AM on a venue closing at 2 AM is the tail of tonight.
    const clockMinutes = start % (24 * 60);

    if (isToday && clockMinutes === start && start <= nowMinutes) continue;

    const hour = Math.floor(clockMinutes / 60);
    const minutes = clockMinutes % 60;
    const period = hour >= 12 ? "PM" : "AM";
    const display = hour % 12 || 12;

    slots.push({
      label: `${display}:${String(minutes).padStart(2, "0")} ${period}`,
      hour,
      minutes,
      // Evening is busiest wherever the café's day ends.
      isPeak: hour >= 18 && hour < 22,
    });
  }

  return slots;
}

export default function BookCafePage() {
  const router = useRouter();
  const params = useParams();
  const cafeParam = String(params?.id || "");

  const [cafe, setCafe] = useState<CafeRow | null>(null);
  const [pricing, setPricing] = useState<Partial<Record<ConsoleId, ConsolePricingTier>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<1 | 2>(1);
  const days = useMemo(buildDays, []);
  const [selectedDate, setSelectedDate] = useState(days[0]?.key ?? "");
  const [selectedTime, setSelectedTime] = useState("");
  const [duration, setDuration] = useState<30 | 60 | 90>(60);
  const [selectedConsole, setSelectedConsole] = useState<ConsoleId>("ps5");
  const [quantities, setQuantities] = useState<Partial<Record<ConsoleId, number>>>({});
  const [availability, setAvailability] = useState<Partial<Record<ConsoleId, ConsoleAvailability>>>({});

  // The café's real hours, falling back to a sensible day if the free-text
  // field cannot be read.
  const openingWindow = useMemo(() => getOpeningWindow(cafe?.opening_hours), [cafe?.opening_hours]);

  const slots = useMemo(
    () => buildSlots(selectedDate, openingWindow),
    [selectedDate, openingWindow]
  );

  // ---------------------------------------------------------------- load café

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // The route accepts either the id or the SEO slug, matching how café
        // pages are linked from elsewhere.
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cafeParam);

        const { data, error: cafeError } = await supabase
          .from("cafes")
          .select(
            "id, name, hourly_price, opening_hours, ps5_count, ps4_count, xbox_count, pc_count, " +
              "pool_count, snooker_count, arcade_count, vr_count, steering_wheel_count, racing_sim_count"
          )
          .eq(isUuid ? "id" : "slug", cafeParam)
          .maybeSingle();

        if (cancelled) return;

        if (cafeError || !data) {
          setError("This café could not be found.");
          return;
        }

        const row = data as unknown as CafeRow;
        setCafe(row);

        const { data: pricingRows } = await supabase
          .from("console_pricing")
          .select("*")
          .eq("cafe_id", row.id);

        if (cancelled) return;

        const map: Partial<Record<ConsoleId, ConsolePricingTier>> = {};
        for (const entry of pricingRows || []) {
          map[entry.console_type as ConsoleId] = entry as ConsolePricingTier;
        }
        setPricing(map);
      } catch {
        if (!cancelled) setError("Something went wrong loading this café.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cafeParam]);

  // ------------------------------------------------------ derived café config

  const consoleLimits = useMemo(() => {
    const limits: Partial<Record<ConsoleId, number>> = {};
    if (!cafe) return limits;

    for (const [consoleId, field] of Object.entries(COUNT_FIELD)) {
      const count = Number(cafe[field] ?? 0);
      if (count > 0) limits[consoleId as ConsoleId] = count;
    }
    return limits;
  }, [cafe]);

  const availableConsoles = useMemo(
    () => Object.keys(consoleLimits) as ConsoleId[],
    [consoleLimits]
  );

  const consoleCards: ConsoleCardData[] = useMemo(
    () =>
      availableConsoles.map((id) => ({
        id,
        label: CONSOLE_LABELS[id] || id,
        icon: CONSOLE_ICONS[id] || "🎮",
        color: CONSOLE_COLORS[id] || colors.cyan,
      })),
    [availableConsoles]
  );

  // Keeps the highlighted console on one the café actually has.
  useEffect(() => {
    if (availableConsoles.length > 0 && !availableConsoles.includes(selectedConsole)) {
      setSelectedConsole(availableConsoles[0]);
    }
  }, [availableConsoles, selectedConsole]);

  // --------------------------------------------------------- live availability

  const loadAvailability = useCallback(async () => {
    if (!cafe || !selectedDate || !selectedTime) return;

    const result = await fetchLiveAvailability({
      cafeId: cafe.id,
      selectedDate,
      selectedTime,
      selectedDuration: duration,
      availableConsoles,
      consoleLimits,
    });

    setAvailability(result);
  }, [cafe, selectedDate, selectedTime, duration, availableConsoles, consoleLimits]);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  // ------------------------------------------------------------------ pricing

  const fallbackPrice = Number(cafe?.hourly_price) || 100;

  const priceFor = useCallback(
    (consoleId: ConsoleId, qty: number) => {
      const tickets = generateTickets(consoleId, pricing[consoleId] ?? null, fallbackPrice, duration);
      return tickets.find((t) => t.players === qty)?.price ?? fallbackPrice;
    },
    [pricing, fallbackPrice, duration]
  );

  const totalAmount = useMemo(
    () =>
      Object.entries(quantities).reduce(
        (sum, [consoleId, qty]) => sum + (qty ? priceFor(consoleId as ConsoleId, qty) : 0),
        0
      ),
    [quantities, priceFor]
  );

  const totalTickets = useMemo(
    () => Object.values(quantities).reduce((sum, qty) => sum + (qty || 0), 0),
    [quantities]
  );

  // Changing duration reprices everything, so stale selections are cleared
  // rather than silently carrying the old price forward.
  useEffect(() => {
    setQuantities({});
  }, [duration]);

  const adjustQuantity = (consoleId: ConsoleId, delta: number) => {
    setQuantities((prev) => {
      const current = prev[consoleId] || 0;
      const free = availability[consoleId]?.available ?? consoleLimits[consoleId] ?? 0;
      // Capped at 4 to match the pricing tiers, which only go that far.
      const next = Math.max(0, Math.min(current + delta, Math.min(free, 4)));

      const updated = { ...prev };
      if (next === 0) delete updated[consoleId];
      else updated[consoleId] = next;
      return updated;
    });
  };

  // ------------------------------------------------------------------ confirm

  const goToCheckout = () => {
    if (!cafe || totalTickets === 0) return;

    const draft = {
      cafeId: cafe.id,
      cafeName: cafe.name,
      bookingDate: selectedDate,
      timeSlot: selectedTime,
      durationMinutes: duration,
      source: "online" as const,
      tickets: Object.entries(quantities).map(([consoleId, qty]) => ({
        ticketId: `${consoleId}_${qty}_${Date.now()}`,
        console: consoleId as ConsoleId,
        title: `${CONSOLE_LABELS[consoleId as ConsoleId] || consoleId} | ${qty} Console${qty! > 1 ? "s" : ""}`,
        price: priceFor(consoleId as ConsoleId, qty!),
        quantity: qty!,
      })),
      totalAmount,
    };

    // sessionStorage rather than a query string: the checkout page already reads
    // it from there, and a booking should not survive being shared as a link.
    window.sessionStorage.setItem("checkoutDraft", JSON.stringify(draft));
    router.push("/checkout");
  };

  // --------------------------------------------------------------------- view

  if (loading) {
    return (
      <div style={{ background: colors.dark, minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <Loader2 className="animate-spin" style={{ color: colors.cyan }} />
      </div>
    );
  }

  if (error || !cafe) {
    return (
      <div style={{ background: colors.dark, minHeight: "100vh", padding: 24, fontFamily: fonts.body }}>
        <p style={{ color: colors.textSecondary }}>{error || "Café not found."}</p>
      </div>
    );
  }

  return (
    <div style={{ background: colors.dark, minHeight: "100vh", paddingBottom: 120, fontFamily: fonts.body }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px" }}>
        <button
          onClick={() => (step === 2 ? setStep(1) : router.back())}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: colors.textSecondary,
            background: "none",
            border: "none",
            marginBottom: 20,
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          <ArrowLeft size={16} />
          {step === 2 ? "Change time" : "Back"}
        </button>

        <h1 style={{ fontFamily: fonts.heading, color: colors.textPrimary, fontSize: 26, marginBottom: 4 }}>
          {cafe.name}
        </h1>
        <p style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 28 }}>
          {step === 1 ? "Pick a date and time" : "Choose what you want to play"}
        </p>

        {step === 1 && (
          <>
            <DatePicker
              dates={days}
              selectedDate={selectedDate}
              onSelect={(date) => {
                setSelectedDate(date);
                setSelectedTime("");
              }}
            />

            <div style={{ height: 24 }} />

            <TimeSlotGrid slots={slots} selectedTime={selectedTime} onSelect={setSelectedTime} />
          </>
        )}

        {step === 2 && (
          <>
            <DurationSelector selectedDuration={duration} onSelect={setDuration} />

            <ConsoleGrid
              consoles={consoleCards}
              availableConsoleIds={availableConsoles}
              selectedConsole={selectedConsole}
              liveAvailability={availability}
              consoleLimits={consoleLimits}
              consolePricing={pricing}
              selectedDuration={duration}
              fallbackPrice={fallbackPrice}
              usedPerConsole={quantities}
              onSelectConsole={setSelectedConsole}
            />

            {/* Quantity stepper for the highlighted console. ConsoleGrid handles
                choosing which console; this is how many of it. */}
            <div
              style={{
                marginTop: 24,
                padding: 16,
                borderRadius: 16,
                background: colors.darkCard,
                border: `1px solid ${colors.border}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <p style={{ color: colors.textPrimary, fontWeight: 700, fontSize: 15 }}>
                    {CONSOLE_LABELS[selectedConsole] || selectedConsole}
                  </p>
                  <p style={{ color: colors.textMuted, fontSize: 12 }}>
                    {availability[selectedConsole]?.available ?? consoleLimits[selectedConsole] ?? 0} available
                    {" · "}₹{priceFor(selectedConsole, Math.max(1, quantities[selectedConsole] || 1))}
                  </p>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button
                    onClick={() => adjustQuantity(selectedConsole, -1)}
                    style={{
                      width: 34, height: 34, borderRadius: 10, cursor: "pointer",
                      background: "rgba(255,255,255,0.06)", border: `1px solid ${colors.border}`,
                      color: colors.textPrimary, display: "grid", placeItems: "center",
                    }}
                  >
                    <Minus size={14} />
                  </button>
                  <span style={{ color: colors.textPrimary, fontWeight: 700, minWidth: 18, textAlign: "center" }}>
                    {quantities[selectedConsole] || 0}
                  </span>
                  <button
                    onClick={() => adjustQuantity(selectedConsole, 1)}
                    style={{
                      width: 34, height: 34, borderRadius: 10, cursor: "pointer",
                      background: colors.cyan, border: "none",
                      color: "#000", display: "grid", placeItems: "center",
                    }}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            </div>

            {totalTickets > 0 && (
              <div style={{ marginTop: 16, padding: 16, borderRadius: 16, background: colors.darkCard, border: `1px solid ${colors.border}` }}>
                {Object.entries(quantities).map(([consoleId, qty]) => (
                  <div key={consoleId} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: colors.textSecondary, marginBottom: 6 }}>
                    <span>{CONSOLE_LABELS[consoleId as ConsoleId] || consoleId} × {qty}</span>
                    <span style={{ color: colors.textPrimary }}>₹{priceFor(consoleId as ConsoleId, qty!)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <BookingBottomBar
        step={step}
        selectedDate={selectedDate}
        selectedTime={selectedTime}
        dateLabel={days.find((d) => d.key === selectedDate)?.dayName}
        onContinue={() => selectedTime && setStep(2)}
        totalTickets={totalTickets}
        totalAmount={totalAmount}
        onConfirm={goToCheckout}
      />
    </div>
  );
}
