// src/components/booking/DurationSelector.tsx
/**
 * How long, in the BookMyGame Site design.
 *
 * Three fixed lengths, written the way people say them rather than in minutes
 * on every tile. The old version repeated the same eighty lines of gradient
 * three times over; this is one list.
 */

const OPTIONS: { minutes: 30 | 60 | 90; big: string; note: string }[] = [
  { minutes: 30, big: "30", note: "MIN" },
  { minutes: 60, big: "1", note: "HOUR" },
  { minutes: 90, big: "1.5", note: "HOURS" },
];

interface DurationSelectorProps {
  selectedDuration: 30 | 60 | 90;
  onSelect: (duration: 30 | 60 | 90) => void;
}

export function DurationSelector({ selectedDuration, onSelect }: DurationSelectorProps) {
  return (
    <div>
      <h2 className="m-0 font-mono text-[11px] tracking-[0.2em] text-[#f2f0ea]/40">HOW LONG</h2>

      <div className="mt-3.5 flex flex-wrap gap-2.5">
        {OPTIONS.map((option) => {
          const on = selectedDuration === option.minutes;

          return (
            <button
              key={option.minutes}
              type="button"
              onClick={() => onSelect(option.minutes)}
              className="min-w-[104px] border px-[22px] py-4 text-left transition-colors"
              style={{
                borderColor: on ? "#d8ff3c" : "rgba(242,240,234,.16)",
                background: on ? "#d8ff3c" : "transparent",
                color: on ? "#0b0b0c" : "#f2f0ea",
              }}
            >
              <div className="text-[26px] font-black leading-none tracking-[-0.02em]">
                {option.big}
              </div>
              <div
                className="mt-1.5 font-mono text-[10px] tracking-[0.18em]"
                style={{ color: on ? "rgba(11,11,12,.65)" : "rgba(242,240,234,.4)" }}
              >
                {option.note}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
