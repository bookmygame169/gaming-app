import { NextRequest, NextResponse } from "next/server";
import {
  requireOwnerContext,
  requireOwnerCafeAccess,
  getOwnedCafeIdForRecord,
} from "@/lib/ownerAuth";
import { isExpenseCategory } from "@/types/expenses";
import { toDateString, toDescription, toPositiveAmount } from "@/lib/expenseInput";

export const dynamic = "force-dynamic";

/**
 * POST/PUT/DELETE /api/owner/expenses
 *
 * What the café spent, written from the owner dashboard.
 *
 * Reads live in /api/owner/lookup under the "expenses" shape, like every other
 * read on this dashboard. Writes are here because they are writes: the browser
 * holds no Supabase session the database can see, so ownership of the café — and
 * of the row being edited — is checked in this file or nowhere.
 *
 * Money only goes in as a positive number. An expense is a direction, not a
 * sign: a negative amount here would silently read as income everywhere it is
 * later summed, and there is no screen that would show it as anything odd.
 */

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;
    const { ownerId, supabase } = auth.context;

    const body = await request.json().catch(() => ({}));
    const cafeId = String(body?.cafeId || "");
    const category = body?.category;
    const amount = toPositiveAmount(body?.amount);
    const expenseDate = toDateString(body?.expense_date);
    const description = toDescription(body?.description);

    if (!cafeId) {
      return NextResponse.json({ error: "cafeId is required" }, { status: 400 });
    }
    if (!isExpenseCategory(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    if (amount === null) {
      return NextResponse.json({ error: "Amount must be more than zero" }, { status: 400 });
    }
    if (!expenseDate) {
      return NextResponse.json({ error: "A valid date is required" }, { status: 400 });
    }

    const accessResponse = await requireOwnerCafeAccess(supabase, ownerId, cafeId);
    if (accessResponse) return accessResponse;

    const { data, error } = await supabase
      .from("expenses")
      .insert({
        cafe_id: cafeId,
        category,
        description,
        amount,
        expense_date: expenseDate,
      })
      .select("id, cafe_id, category, description, amount, expense_date, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ expense: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to save the expense";
    console.error("Expense create failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;
    const { ownerId, supabase } = auth.context;

    const body = await request.json().catch(() => ({}));
    const expenseId = String(body?.expenseId || "");

    if (!expenseId) {
      return NextResponse.json({ error: "expenseId is required" }, { status: 400 });
    }

    // Ownership is resolved from the row itself rather than from a cafeId the
    // browser sent, so naming someone else's expense id cannot reach it.
    const ownedCafeId = await getOwnedCafeIdForRecord(supabase, "expenses", expenseId, ownerId);
    if (!ownedCafeId) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};

    if (body?.category !== undefined) {
      if (!isExpenseCategory(body.category)) {
        return NextResponse.json({ error: "Invalid category" }, { status: 400 });
      }
      updates.category = body.category;
    }

    if (body?.amount !== undefined) {
      const amount = toPositiveAmount(body.amount);
      if (amount === null) {
        return NextResponse.json({ error: "Amount must be more than zero" }, { status: 400 });
      }
      updates.amount = amount;
    }

    if (body?.expense_date !== undefined) {
      const expenseDate = toDateString(body.expense_date);
      if (!expenseDate) {
        return NextResponse.json({ error: "A valid date is required" }, { status: 400 });
      }
      updates.expense_date = expenseDate;
    }

    if (body?.description !== undefined) {
      updates.description = toDescription(body.description);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("expenses")
      .update(updates)
      .eq("id", expenseId)
      .select("id, cafe_id, category, description, amount, expense_date, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ expense: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update the expense";
    console.error("Expense update failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireOwnerContext(request);
    if (auth.response) return auth.response;
    const { ownerId, supabase } = auth.context;

    const body = await request.json().catch(() => ({}));
    const expenseId = String(body?.expenseId || "");

    if (!expenseId) {
      return NextResponse.json({ error: "expenseId is required" }, { status: 400 });
    }

    const ownedCafeId = await getOwnedCafeIdForRecord(supabase, "expenses", expenseId, ownerId);
    if (!ownedCafeId) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    // A hard delete, unlike a booking. A booking that vanishes takes a
    // customer's history and a day's takings with it, which is why those are
    // soft-deleted; an expense row is a number somebody typed, and a wrong one
    // is worth nothing to keep.
    const { error } = await supabase.from("expenses").delete().eq("id", expenseId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete the expense";
    console.error("Expense delete failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
