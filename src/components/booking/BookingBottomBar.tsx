// src/components/booking/BookingBottomBar.tsx
/**
 * The bar pinned to the bottom of the booking screen, in the BookMyGame Site
 * design: what has been chosen on the left, the one thing to press on the
 * right.
 *
 * It stays fixed rather than becoming a sticky side rail on desktop, because
 * this is the only control that moves the booking forward and a customer
 * halfway down a long list of machines should never have to hunt for it.
 */

interface BookingBottomBarProps {
  step: 1 | 2;

  // Step 1 props
  selectedDate?: string;
  selectedTime?: string;
  dateLabel?: string;
  onContinue?: () => void;

  // Step 2 props
  totalTickets?: number;
  totalAmount?: number;
  isSubmitting?: boolean;
  onConfirm?: () => void;
}

export function BookingBottomBar({
  step,
  selectedTime,
  dateLabel,
  onContinue,
  totalTickets = 0,
  totalAmount = 0,
  isSubmitting = false,
  onConfirm,
}: BookingBottomBarProps) {
  const ready = step === 1 ? Boolean(selectedTime) : totalTickets > 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] border-t border-[#f2f0ea]/[0.12] bg-[#0b0b0c]/95 px-5 py-4 backdrop-blur-[14px] sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-5">
        <div className="min-w-0">
          <div className="font-mono text-[10px] tracking-[0.2em] text-[#f2f0ea]/40">
            {step === 1 ? "WHEN" : "TOTAL"}
          </div>
          {step === 1 ? (
            <div className="mt-1.5 truncate text-[15px] font-extrabold text-[#f2f0ea]">
              {selectedTime
                ? `${dateLabel ? `${dateLabel} · ` : ""}${selectedTime}`
                : "Pick a day and a time"}
            </div>
          ) : (
            <div className="mt-1 flex items-baseline gap-2.5">
              <span className="text-[28px] font-black leading-none tracking-[-0.03em] text-[#f2f0ea]">
                ₹{totalAmount.toLocaleString("en-IN")}
              </span>
              <span className="font-mono text-[11px] tracking-[0.14em] text-[#f2f0ea]/40">
                {totalTickets} SEAT{totalTickets === 1 ? "" : "S"}
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={step === 1 ? onContinue : onConfirm}
          disabled={!ready || isSubmitting}
          className="shrink-0 whitespace-nowrap px-8 py-4 font-display text-[13px] font-black tracking-[0.14em] transition-[filter] enabled:hover:brightness-110 disabled:cursor-not-allowed"
          style={{
            background: ready ? "#d8ff3c" : "rgba(242,240,234,.08)",
            color: ready ? "#0b0b0c" : "rgba(242,240,234,.35)",
          }}
        >
          {step === 1 ? "NEXT →" : isSubmitting ? "HOLDING…" : "CONFIRM & PAY →"}
        </button>
      </div>
    </div>
  );
}
