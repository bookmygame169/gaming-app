"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { colors, CONSOLE_LABELS, CONSOLE_ICONS, CONSOLE_COLORS } from "@/lib/constants";
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

        // console_pricing holds one row per (kind, how many, how long) — it has
        // no qty1_60min column and never did. Casting a row to a tier therefore
        // produced an object of undefined prices, every machine fell through to
        // the cafe's flat hourly_price, and a PS5 hour that costs 150 at the
        // counter was sold here for 100. This folds the rows into the tier the
        // rest of the screen reads.
        const map: Partial<Record<ConsoleId, ConsolePricingTier>> = {};
        for (const entry of pricingRows || []) {
          const type = entry.console_type as ConsoleId;
          const qty = Number(entry.quantity) || 1;
          const minutes = Number(entry.duration_minutes);

          // The tiers only go to four seats and two lengths; anything else on
          // the price list belongs to a flow this screen does not offer.
          if (qty < 1 || qty > 4) continue;
          if (minutes !== 30 && minutes !== 60) continue;

          const tier: ConsolePricingTier = map[type] ?? {
            qty1_30min: null, qty1_60min: null,
            qty2_30min: null, qty2_60min: null,
            qty3_30min: null, qty3_60min: null,
            qty4_30min: null, qty4_60min: null,
          };

          tier[`qty${qty}_${minutes}min` as keyof ConsolePricingTier] =
            Number(entry.price) || null;
          map[type] = tier;
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
      <div className="grid min-h-screen place-items-center bg-[#0b0b0c] font-mono text-xs tracking-[0.2em] text-[#f2f0ea]/40">
        LOADING…
      </div>
    );
  }

  if (error || !cafe) {
    return (
      <div className="min-h-screen bg-[#0b0b0c] px-5 py-16 font-display text-[#f2f0ea] sm:px-8 lg:px-12">
        <div className="font-mono text-xs tracking-[0.28em] text-[#ff5c2b]">CANNOT BOOK</div>
        <h1 className="mt-5 text-[clamp(30px,5vw,52px)] font-black uppercase leading-[0.95] tracking-[-0.04em]">
          {error || "Café not found."}
        </h1>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0b0c] pb-[140px] font-display text-[#f2f0ea]">
      <div className="flex items-center gap-3.5 border-b border-[#f2f0ea]/[0.12] px-5 py-[22px] font-mono text-xs tracking-[0.18em] text-[#f2f0ea]/40 sm:px-8 lg:px-12">
        <button
          type="button"
          onClick={() => (step === 2 ? setStep(1) : router.back())}
          className="transition-colors hover:text-[#d8ff3c]"
        >
          {step === 2 ? "← CHANGE TIME" : "← BACK"}
        </button>
        <span>/</span>
        <span className="truncate text-[#f2f0ea]">{cafe.name?.toUpperCase()}</span>
      </div>

      <div className="flex items-baseline gap-[18px] px-5 pb-7 pt-10 sm:px-8 lg:px-12">
        <h1 className="m-0 text-[clamp(28px,4.4vw,44px)] font-black uppercase leading-none tracking-[-0.03em]">
          {step === 1 ? "When?" : "What are you playing?"}
        </h1>
        <span className="h-px flex-1 bg-[#f2f0ea]/[0.14]" />
        <span className="hidden whitespace-nowrap font-mono text-[13px] tracking-[0.2em] text-[#f2f0ea]/40 md:block">
          STEP {step} OF 2
        </span>
      </div>

      <div className="flex flex-col gap-9 border-t border-[#f2f0ea]/[0.12] px-5 py-9 sm:px-8 lg:px-12">
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

            {/* How many of the highlighted machine. ConsoleGrid chooses which
                kind; this is the count, and it is deliberately next to the
                grid rather than inside a tile, where a plus and a minus are
                too easy to hit while trying to pick. */}
            <div className="border border-[#f2f0ea]/[0.14]">
              <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
                <div>
                  <div className="text-[15px] font-extrabold">
                    {CONSOLE_LABELS[selectedConsole] || selectedConsole}
                  </div>
                  <div className="mt-1 font-mono text-[11px] tracking-[0.14em] text-[#f2f0ea]/40">
                    {availability[selectedConsole]?.available ?? consoleLimits[selectedConsole] ?? 0} FREE
                    {" · ₹"}
                    {priceFor(selectedConsole, Math.max(1, quantities[selectedConsole] || 1))}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => adjustQuantity(selectedConsole, -1)}
                    className="h-11 w-11 border border-[#f2f0ea]/20 font-mono text-lg text-[#f2f0ea] transition-colors hover:border-[#f2f0ea]"
                    aria-label="One fewer"
                  >
                    −
                  </button>
                  <span className="min-w-[24px] text-center text-xl font-black">
                    {quantities[selectedConsole] || 0}
                  </span>
                  <button
                    type="button"
                    onClick={() => adjustQuantity(selectedConsole, 1)}
                    className="h-11 w-11 bg-[#d8ff3c] font-mono text-lg text-[#0b0b0c] transition-[filter] hover:brightness-110"
                    aria-label="One more"
                  >
                    +
                  </button>
                </div>
              </div>

              {totalTickets > 0 && (
                <div className="border-t border-[#f2f0ea]/10 px-6 py-4">
                  {Object.entries(quantities)
                    .filter(([, qty]) => (qty ?? 0) > 0)
                    .map(([consoleId, qty]) => (
                      <div
                        key={consoleId}
                        className="flex items-baseline justify-between gap-4 py-1.5"
                      >
                        <span className="font-mono text-xs tracking-[0.14em] text-[#f2f0ea]/45">
                          {(CONSOLE_LABELS[consoleId as ConsoleId] || consoleId).toUpperCase()} × {qty}
                        </span>
                        <span className="text-[15px] font-bold">
                          ₹{priceFor(consoleId as ConsoleId, qty!)}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
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
