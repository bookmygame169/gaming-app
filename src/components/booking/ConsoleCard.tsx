// src/components/booking/ConsoleCard.tsx
/**
 * One kind of machine, as a tile in the BookMyGame Site design.
 *
 * The design's seat tiles carry three lines — what it is, its number, and its
 * state — and these carry the same three: the name, the hourly price, and how
 * many are free. Sold out is drawn as a dead tile rather than a red badge on a
 * live one, because it cannot be pressed at all.
 */

import { type ConsoleId } from "@/lib/constants";

export interface ConsoleCardData {
  id: ConsoleId;
  label: string;
  icon: string;
  color: string;
}

interface ConsoleCardProps {
  console: ConsoleCardData;
  isActive: boolean;
  isSoldOut: boolean;
  isLowStock: boolean;
  availableSlots: number;
  totalSlots: number;
  mySelection: number;
  price: number;
  onClick: () => void;
}

export function ConsoleCard({
  console,
  isActive,
  isSoldOut,
  isLowStock,
  availableSlots,
  totalSlots,
  mySelection,
  price,
  onClick,
}: ConsoleCardProps) {
  const border = isActive ? "#d8ff3c" : isSoldOut ? "rgba(242,240,234,.07)" : "rgba(242,240,234,.16)";
  const background = isActive ? "#d8ff3c" : isSoldOut ? "rgba(242,240,234,.03)" : "transparent";
  const foreground = isActive ? "#0b0b0c" : isSoldOut ? "rgba(242,240,234,.3)" : "#f2f0ea";
  const muted = isActive ? "rgba(11,11,12,.65)" : "rgba(242,240,234,.4)";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isSoldOut}
      className="w-[112px] shrink-0 border px-3 py-3.5 text-center transition-colors disabled:cursor-not-allowed"
      style={{ borderColor: border, background, color: foreground }}
    >
      <div className="font-mono text-[10px] tracking-[0.16em]" style={{ color: muted }}>
        {console.label.toUpperCase()}
      </div>

      <div className="mt-1.5 text-[19px] font-black tracking-[-0.01em]">₹{price}</div>

      <div
        className="mt-1.5 font-mono text-[9px] tracking-[0.14em]"
        style={{
          color: isActive
            ? "rgba(11,11,12,.65)"
            : isSoldOut
              ? "rgba(242,240,234,.3)"
              : isLowStock
                ? "#ff5c2b"
                : "rgba(242,240,234,.4)",
        }}
      >
        {isSoldOut ? "ALL TAKEN" : `${availableSlots}/${totalSlots} FREE`}
      </div>

      {mySelection > 0 && (
        <div
          className="mt-2 py-1 font-mono text-[9px] tracking-[0.14em]"
          style={{
            background: isActive ? "rgba(11,11,12,.15)" : "rgba(216,255,60,.14)",
            color: isActive ? "#0b0b0c" : "#d8ff3c",
          }}
        >
          {mySelection} PICKED
        </div>
      )}
    </button>
  );
}
