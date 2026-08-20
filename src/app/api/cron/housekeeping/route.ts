import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/housekeeping
 *
 * Three jobs the database has always been able to do and was never asked to.
 *
 * check_subscription_expiry, auto_complete_ended_bookings and
 * purge_expired_unlock_tokens all existed as functions, attached to no trigger
 * and named in no schedule — so none of them had ever run. The visible cost was
 * six memberships sitting 'active' past their expiry date, which means six
 * customers able to spend hours they no longer owned.
 *
 * Each is run independently and a failure in one does not stop the next: they
 * have nothing to do with each other, and losing all three because one threw
 * would be how this quietly stops working again.
 */

type JobResult = { job: string; ok: boolean; detail?: string };

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    console.error("[Housekeeping] CRON_SECRET is not set; rejecting request.");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const results: JobResult[] = [];

  for (const job of [
    "check_subscription_expiry",
    "auto_complete_ended_bookings",
    "purge_expired_unlock_tokens",
  ]) {
    try {
      const { error } = await supabase.rpc(job);
      if (error) {
        console.error(`[Housekeeping] ${job} failed:`, error.message);
        results.push({ job, ok: false, detail: error.message });
      } else {
        results.push({ job, ok: true });
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`[Housekeeping] ${job} threw:`, detail);
      results.push({ job, ok: false, detail });
    }
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`[Housekeeping] ${results.length - failed.length}/${results.length} jobs ran cleanly.`);

  // 200 even with a failure: this is a scheduled job, and a non-200 buys a
  // retry of all three when only one was broken. The detail is in the body.
  return NextResponse.json({ results });
}
