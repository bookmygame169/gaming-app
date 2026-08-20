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
 *
 * A generic upi:// link is not used as the primary action. On a lot of Indian
 * phones WhatsApp (or whichever app the customer once set as default) swallows
 * that link and never shows a chooser. Each app is opened by its own scheme,
 * and on Android by a package-targeted intent, so the customer picks FamPay,
 * Paytm, GPay, or anything else from a list rather than being hijacked.
 */

export type UpiPayee = {
  upiId: string;
  displayName: string;
};

export type UpiAppOption = {
  id: string;
  label: string;
  helper: string;
  /** Letters shown on the app tile. */
  mark: string;
  markClassName: string;
  /** Custom URL scheme. What iOS and fallbacks use. */
  href: string;
  /**
   * Android Chrome intent aimed at one app's package. That is what actually
   * bypasses the default handler (WhatsApp, etc.).
   */
  androidHref: string;
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

/**
 * Android intent aimed at one installed UPI app.
 *
 * package= is the important part. Without it Chrome uses the default handler,
 * which is how Pay now kept opening WhatsApp.
 */
function androidPackagePay(packageName: string, query: string): string {
  return `intent://pay?${query}#Intent;scheme=upi;package=${packageName};end`;
}

export function buildAndroidUpiChooserUrl(
  payee: UpiPayee,
  amount: number,
  bookingId: string,
  cafeName?: string | null
): string {
  const query = buildUpiQuery(payee, amount, bookingId, cafeName);
  // No package and no browser_fallback_url: the closest a website can get to
  // Android's own "Open with" sheet. Phones that already have a default UPI
  // app will still skip the sheet — which is why the named list is the real
  // chooser.
  return `intent://pay?${query}#Intent;scheme=upi;action=android.intent.action.VIEW;end`;
}

export function buildUpiAppOptions(
  payee: UpiPayee,
  amount: number,
  bookingId: string,
  cafeName?: string | null
): UpiAppOption[] {
  const query = buildUpiQuery(payee, amount, bookingId, cafeName);

  const apps: Array<{
    id: string;
    label: string;
    helper: string;
    mark: string;
    markClassName: string;
    scheme: string;
    packageName: string;
  }> = [
    {
      id: "paytm",
      label: "Paytm",
      helper: "Paytm",
      mark: "Pay",
      markClassName: "bg-[#00BAF2] text-white",
      scheme: `paytmmp://pay?${query}`,
      packageName: "net.one97.paytm",
    },
    {
      id: "gpay",
      label: "GPay",
      helper: "Google Pay",
      mark: "G",
      markClassName: "bg-white text-[#1a73e8]",
      scheme: `tez://upi/pay?${query}`,
      packageName: "com.google.android.apps.nbu.paisa.user",
    },
    {
      id: "phonepe",
      label: "PhonePe",
      helper: "PhonePe",
      mark: "Pe",
      markClassName: "bg-[#5f259f] text-white",
      scheme: `phonepe://pay?${query}`,
      packageName: "com.phonepe.app",
    },
    {
      id: "fampay",
      label: "FamPay",
      helper: "FamPay",
      mark: "Fam",
      markClassName: "bg-[#ff6a00] text-white",
      scheme: `fampay://upi/pay?${query}`,
      packageName: "com.fampay.app",
    },
    {
      id: "whatsapp",
      label: "WhatsApp",
      helper: "WhatsApp Pay",
      mark: "WA",
      markClassName: "bg-[#25D366] text-white",
      scheme: `upi://pay?${query}`,
      packageName: "com.whatsapp",
    },
    {
      id: "bhim",
      label: "BHIM",
      helper: "BHIM UPI",
      mark: "BH",
      markClassName: "bg-[#F7941D] text-white",
      scheme: `bhim://upi/pay?${query}`,
      packageName: "in.org.npci.upiapp",
    },
    {
      id: "amazon",
      label: "Amazon",
      helper: "Amazon Pay",
      mark: "a",
      markClassName: "bg-[#131921] text-[#FF9900]",
      scheme: `amazonpay://upi/pay?${query}`,
      packageName: "in.amazon.mShop.android.shopping",
    },
    {
      id: "cred",
      label: "CRED",
      helper: "CRED",
      mark: "C",
      markClassName: "bg-black text-white",
      scheme: `cred://upi/pay?${query}`,
      packageName: "com.dreamplug.androidapp",
    },
    {
      id: "mobikwik",
      label: "MobiKwik",
      helper: "MobiKwik",
      mark: "Mk",
      markClassName: "bg-[#0047BB] text-white",
      scheme: `mobikwik://upi/pay?${query}`,
      packageName: "com.mobikwik_new",
    },
    {
      id: "navi",
      label: "Navi",
      helper: "Navi UPI",
      mark: "N",
      markClassName: "bg-[#FFE14D] text-black",
      scheme: `navi://upi/pay?${query}`,
      packageName: "com.naviapp",
    },
  ];

  return apps.map((app) => ({
    id: app.id,
    label: app.label,
    helper: app.helper,
    mark: app.mark,
    markClassName: app.markClassName,
    href: app.scheme,
    androidHref: androidPackagePay(app.packageName, query),
  }));
}

/**
 * The link behind the QR on a locked PC's Pay Now screen.
 *
 * Separate from the booking link only because of the note. A booking carries an
 * id the owner reconciles against; a customer standing at a machine has not got
 * one yet, and the useful thing on the owner's statement is which seat the
 * money came from.
 *
 * The amount is in the link, which is most of the value of generating this
 * rather than showing a printed QR: the customer scans, sees the right figure
 * already filled in, and cannot pay ₹70 for an hour by mistyping.
 */
export function buildStationPaymentUrl(
  payee: UpiPayee,
  amount: number,
  stationName: string
): string {
  const query = new URLSearchParams({
    pa: payee.upiId,
    pn: payee.displayName,
    am: amount.toFixed(2),
    cu: "INR",
    tn: `${stationName.toUpperCase()} gaming`,
  }).toString();

  return `upi://pay?${query}`;
}
