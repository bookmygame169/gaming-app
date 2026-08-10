// src/lib/upi.ts
/**
 * Building the UPI links a customer taps to pay a café.
 *
 * The payee always comes from the café being paid. There is deliberately no
 * fallback id: the previous version hardcoded one Paytm QR for the whole
 * platform, so every café's advance payments went to the same account. A café
 * with no UPI id set shows no Pay button at all, which is the correct outcome —
 * a missing button loses one advance payment, a wrong one takes another café's
 * money.
 */

export type UpiPayee = {
  upiId: string;
  displayName: string;
};

/**
 * A UPI id looks like name@bank. Checked before a link is built so a typo in
 * the settings form fails visibly rather than producing a link that silently
 * does nothing when tapped.
 */
const UPI_ID_PATTERN = /^[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z][a-zA-Z0-9.\-_]{1,64}$/;

export function isValidUpiId(value: string | null | undefined): boolean {
  return typeof value === "string" && UPI_ID_PATTERN.test(value.trim());
}

export function getCafePayee(cafe: {
  upi_id?: string | null;
  upi_display_name?: string | null;
  name?: string | null;
}): UpiPayee | null {
  const upiId = cafe.upi_id?.trim();
  if (!isValidUpiId(upiId)) return null;

  return {
    upiId: upiId!,
    // The café's own name is the sensible default: the customer is about to see
    // this in their bank app and needs to recognise who they are paying.
    displayName: (cafe.upi_display_name?.trim() || cafe.name?.trim() || "Gaming Cafe").slice(0, 50),
  };
}

function buildUpiQuery(
  payee: UpiPayee,
  amount: number,
  bookingId: string,
  cafeName?: string | null
): string {
  return new URLSearchParams({
    pa: payee.upiId,
    pn: payee.displayName,
    am: amount.toFixed(2),
    cu: "INR",
    // The short booking id is what the owner matches the payment against, so it
    // has to survive into the note the payee sees on their statement.
    tn: `Booking ${bookingId.slice(0, 8).toUpperCase()}${cafeName ? ` - ${cafeName}` : ""}`,
  }).toString();
}

export function buildUpiPaymentUrl(
  payee: UpiPayee,
  amount: number,
  bookingId: string,
  cafeName?: string | null
): string {
  return `upi://pay?${buildUpiQuery(payee, amount, bookingId, cafeName)}`;
}

export function buildAndroidUpiChooserUrl(
  payee: UpiPayee,
  amount: number,
  bookingId: string,
  cafeName?: string | null
): string {
  const query = buildUpiQuery(payee, amount, bookingId, cafeName);
  const fallback = buildUpiPaymentUrl(payee, amount, bookingId, cafeName);

  return `intent://pay?${query}#Intent;scheme=upi;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=${encodeURIComponent(
    fallback
  )};end`;
}

export function buildUpiAppOptions(
  payee: UpiPayee,
  amount: number,
  bookingId: string,
  cafeName?: string | null
) {
  const query = buildUpiQuery(payee, amount, bookingId, cafeName);

  return [
    {
      label: "Paytm",
      helper: "Open Paytm",
      href: `paytmmp://pay?${query}`,
      className: "from-sky-500 to-cyan-500 text-white",
    },
    {
      label: "Google Pay",
      helper: "Open GPay",
      href: `tez://upi/pay?${query}`,
      className: "from-blue-500 to-emerald-500 text-white",
    },
    {
      label: "PhonePe",
      helper: "Open PhonePe",
      href: `phonepe://pay?${query}`,
      className: "from-violet-500 to-purple-700 text-white",
    },
    {
      label: "BHIM",
      helper: "Open BHIM",
      href: `bhim://upi/pay?${query}`,
      className: "from-orange-500 to-rose-600 text-white",
    },
  ];
}
