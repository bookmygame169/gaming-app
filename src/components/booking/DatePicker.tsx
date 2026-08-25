// src/components/booking/DatePicker.tsx
/**
 * Which day, as a row of square tiles in the BookMyGame Site design.
 *
 * The selected day is filled lime rather than outlined, because on a scrolling
 * row of near-identical tiles an outline is easy to lose — and picking the
 * wrong day is the one mistake on this screen nobody notices until they turn
 * up at the café.
 */

import { DayOption } from "@/types/booking";

interface DatePickerProps {
  dates: DayOption[];
  selectedDate: string;
  onSelect: (date: string) => void;
}

export function DatePicker({ dates, selectedDate, onSelect }: DatePickerProps) {
  return (
    <section>
      <h2 className="m-0 font-mono text-[11px] tracking-[0.2em] text-[#f2f0ea]/40">WHICH DAY</h2>

      <div className="mt-3.5 flex gap-2.5 overflow-x-auto pb-2 [scrollbar-width:none]">
        {dates.map((day) => {
          const on = day.key === selectedDate;

          return (
            <button
              key={day.key}
              type="button"
              onClick={() => onSelect(day.key)}
              className="w-[76px] shrink-0 border px-1.5 py-3 text-center transition-colors"
              style={{
                borderColor: on ? "#d8ff3c" : "rgba(242,240,234,.16)",
                background: on ? "#d8ff3c" : "transparent",
                color: on ? "#0b0b0c" : "#f2f0ea",
              }}
            >
              <div
                className="font-mono text-[10px] tracking-[0.16em]"
                style={{ color: on ? "rgba(11,11,12,.65)" : "rgba(242,240,234,.4)" }}
              >
                {day.isToday ? "TODAY" : day.dayName.toUpperCase()}
              </div>
              <div className="mt-1.5 text-xl font-black tracking-[-0.01em]">{day.dayNum}</div>
              <div
                className="mt-1 font-mono text-[10px] tracking-[0.14em]"
                style={{ color: on ? "rgba(11,11,12,.65)" : "rgba(242,240,234,.35)" }}
              >
                {day.month.toUpperCase()}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
