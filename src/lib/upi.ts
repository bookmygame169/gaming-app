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
  label: string;
  helper: string;
  /** Custom URL scheme. What iOS and fallbacks use. */
  href: string;
  /**
   * Android Chrome intent aimed at one app's package. That is what actually
   * bypasses the default handler (WhatsApp, etc.).
   */
  androidHref: string;
  className: string;
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
    label: string;
    helper: string;
    scheme: string;
    packageName: string;
    className: string;
  }> = [
    {
      label: "Paytm",
      helper: "Paytm",
      scheme: `paytmmp://pay?${query}`,
      packageName: "net.one97.paytm",
      className: "from-sky-500 to-cyan-500 text-white",
    },
    {
      label: "Google Pay",
      helper: "GPay",
      scheme: `tez://upi/pay?${query}`,
      packageName: "com.google.android.apps.nbu.paisa.user",
      className: "from-blue-500 to-emerald-500 text-white",
    },
    {
      label: "PhonePe",
      helper: "PhonePe",
      scheme: `phonepe://pay?${query}`,
      packageName: "com.phonepe.app",
      className: "from-violet-500 to-purple-700 text-white",
    },
    {
      label: "FamPay",
      helper: "FamPay",
      scheme: `fampay://upi/pay?${query}`,
      packageName: "com.fampay.app",
      className: "from-orange-400 to-amber-500 text-white",
    },
    {
      label: "WhatsApp",
      helper: "WhatsApp Pay",
      scheme: `upi://pay?${query}`,
      packageName: "com.whatsapp",
      className: "from-emerald-500 to-green-700 text-white",
    },
    {
      label: "BHIM",
      helper: "BHIM UPI",
      scheme: `bhim://upi/pay?${query}`,
      packageName: "in.org.npci.upiapp",
      className: "from-orange-500 to-rose-600 text-white",
    },
    {
      label: "Amazon Pay",
      helper: "Amazon",
      scheme: `amazonpay://upi/pay?${query}`,
      packageName: "in.amazon.mShop.android.shopping",
      className: "from-slate-600 to-slate-800 text-white",
    },
    {
      label: "CRED",
      helper: "CRED",
      scheme: `cred://upi/pay?${query}`,
      packageName: "com.dreamplug.androidapp",
      className: "from-neutral-700 to-black text-white",
    },
    {
      label: "MobiKwik",
      helper: "MobiKwik",
      scheme: `mobikwik://upi/pay?${query}`,
      packageName: "com.mobikwik_new",
      className: "from-blue-600 to-indigo-700 text-white",
    },
    {
      label: "Navi",
      helper: "Navi UPI",
      scheme: `navi://upi/pay?${query}`,
      packageName: "com.naviapp",
      className: "from-yellow-400 to-yellow-600 text-black",
    },
  ];

  return apps.map((app) => ({
    label: app.label,
    helper: app.helper,
    href: app.scheme,
    androidHref: androidPackagePay(app.packageName, query),
    className: app.className,
  }));
}
