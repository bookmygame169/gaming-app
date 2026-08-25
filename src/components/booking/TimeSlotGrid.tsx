// src/components/booking/TimeSlotGrid.tsx
/**
 * Start times, in the BookMyGame Site design: mono type on square tiles,
 * wrapping rather than locked to three columns.
 *
 * Busy slots keep their marker. It is the one thing on this grid worth saying
 * out loud — the hour is bookable, but it is the hour everyone else wants too.
 */

import { TimeSlot } from "@/types/booking";

interface TimeSlotGridProps {
  slots: TimeSlot[];
  selectedTime: string;
  onSelect: (time: string) => void;
  peakHoursMessage?: string;
}

export function TimeSlotGrid({
  slots,
  selectedTime,
  onSelect,
  peakHoursMessage = "BUSIEST 6 PM – 10 PM",
}: TimeSlotGridProps) {
  if (slots.length === 0) {
    return (
      <section>
        <h2 className="m-0 font-mono text-[11px] tracking-[0.2em] text-[#f2f0ea]/40">START TIME</h2>
        <div className="mt-3.5 border border-[#f2f0ea]/[0.14] px-6 py-8">
          <p className="text-base font-extrabold text-[#f2f0ea]">Nothing left today</p>
          <p className="mt-2 font-mono text-xs tracking-[0.14em] text-[#f2f0ea]/40">
            PICK ANOTHER DAY ABOVE
          </p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="m-0 font-mono text-[11px] tracking-[0.2em] text-[#f2f0ea]/40">START TIME</h2>

      <div className="mt-3.5 flex flex-wrap gap-2.5">
        {slots.map((slot) => {
          const on = slot.label === selectedTime;

          return (
            <button
              key={slot.label}
              type="button"
              onClick={() => onSelect(slot.label)}
              className="relative border px-[18px] py-3.5 font-mono text-[13px] tracking-[0.1em] transition-colors"
              style={{
                borderColor: on ? "#d8ff3c" : "rgba(242,240,234,.16)",
                background: on ? "#d8ff3c" : "transparent",
                color: on ? "#0b0b0c" : "rgba(242,240,234,.75)",
              }}
            >
              {slot.label}
              {slot.isPeak && (
                <span
                  className="absolute right-1 top-1 h-1.5 w-1.5"
                  style={{ background: on ? "#0b0b0c" : "#ff5c2b" }}
                />
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-3.5 flex items-center gap-2.5 font-mono text-[11px] tracking-[0.14em] text-[#f2f0ea]/35">
        <span className="inline-block h-1.5 w-1.5 bg-[#ff5c2b]" />
        {peakHoursMessage}
      </p>
    </section>
  );
}
