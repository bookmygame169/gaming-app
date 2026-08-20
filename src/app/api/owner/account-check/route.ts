import { NextRequest, NextResponse } from "next/server";
import { requireOwnerContext } from "@/lib/ownerAuth";
import { phoneKey } from "@/lib/loyalty";

export const dynamic = "force-dynamic";

/**
 * GET /api/owner/account-check?phone=…
 *
 * Whether this phone number reaches a BookMyGame account.
 *
 * A membership is joined to its owner by phone number and nothing else: the
 * customer's app looks for subscriptions whose number matches the one on their
 * profile. That works, and it fails silently when it doesn't — 145 memberships
 * have been sold here and exactly one of them reaches an account, because the
 * people buying them at the counter never signed up.
 *
 * Neither side ever found out. The owner types a number, the sale completes,
 * and the hours sit against a phone nobody has registered. This is the smallest
 * thing that makes that visible at the moment it can still be acted on — while
 * the customer is standing at the counter and can be asked to install the app.
 *
 * Deliberately returns a yes or no and nothing else. The owner already has the
 * number in front of them; handing back a name would turn this into a way to
 * look up who owns any phone number.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;

    const { supabase } = auth.context;
    const key = phoneKey(request.nextUrl.searchParams.get("phone"));

    // Not a usable number yet — the owner is still typing.
    if (!key) {
      return NextResponse.json({ known: false, hasAccount: false });
    }

    // Matched on the last ten digits rather than with .eq(), because profiles
    // hold whatever was typed over the years: with +91, with spaces, without.
    // The same comparison the customer's own app makes, so this cannot say yes
    // where the app would say no.
    const { data, error } = await supabase.from("profiles").select("phone").not("phone", "is", null);

    if (error) {
      console.error("Account check failed:", error.message);
      // Soft: this sits beside a sale and must never be the reason one stops.
      return NextResponse.json({ known: false, hasAccount: false });
    }

    const hasAccount = (data || []).some((row) => phoneKey(row.phone as string | null) === key);

    return NextResponse.json({ known: true, hasAccount });
  } catch (err) {
    console.error("Unexpected error checking for an account:", err);
    return NextResponse.json({ known: false, hasAccount: false });
  }
}
