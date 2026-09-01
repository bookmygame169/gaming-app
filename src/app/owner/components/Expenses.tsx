"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Trash2, X } from "lucide-react";
import {
  Chips,
  EmptyRow,
  Field,
  GhostButton,
  Kpis,
  Panel,
  PrimaryButton,
  SectionBar,
  TableHead,
  TableRow,
  Tag,
} from "./consoleUi";
import { fetchExpenses } from "@/app/owner/ownerLookup";
import { getLocalDateString } from "@/app/owner/utils";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type Expense,
  type ExpenseCategory,
} from "@/types/expenses";

/**
 * What the café spent.
 *
 * Every other screen in this dashboard answers "how much came in". Without
 * this one the answer to "did we make money" is a number nobody has, because
 * rent, salaries and electricity were never anywhere in the product — takings
 * were being read as earnings by default.
 *
 * Deliberately blunt to fill in: a date that starts on today, eight categories
 * and an amount. An expense form that takes a minute to complete is one that
 * gets completed at the end of the month from memory, which is worth less than
 * not having it.
 */

interface ExpensesProps {
  cafeId: string;
}

const COLUMNS = "104px 132px minmax(0,1fr) 116px 84px";

const RANGES = [
  { id: "month", label: "THIS MONTH" },
  { id: "30d", label: "30 DAYS" },
  { id: "12m", label: "12 MONTHS" },
  { id: "all", label: "ALL" },
] as const;

type RangeId = (typeof RANGES)[number]["id"];

function rangeStart(range: RangeId): string | undefined {
  const now = new Date();

  if (range === "month") {
    return getLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
  }
  if (range === "30d") {
    const from = new Date(now);
    from.setDate(now.getDate() - 30);
    return getLocalDateString(from);
  }
  if (range === "12m") {
    const from = new Date(now);
    from.setMonth(now.getMonth() - 12);
    return getLocalDateString(from);
  }
  return undefined;
}

function rupees(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

/** "12 Aug" — the table has a row per entry, so the year is noise until it isn't. */
function shortDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;

  const thisYear = parsed.getFullYear() === new Date().getFullYear();
  return parsed.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(thisYear ? {} : { year: "2-digit" }),
  });
}

export default function Expenses({ cafeId }: ExpensesProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeId>("month");
  const [filter, setFilter] = useState<string>("all");

  const [date, setDate] = useState(getLocalDateString());
  const [category, setCategory] = useState<ExpenseCategory>("stock");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!cafeId) return;
    setLoading(true);
    const rows = await fetchExpenses<Expense>(cafeId, { from: rangeStart(range) });
    setExpenses(rows.map((row) => ({ ...row, amount: Number(row.amount) || 0 })));
    setLoading(false);
  }, [cafeId, range]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setDate(getLocalDateString());
    setCategory("stock");
    setAmount("");
    setDescription("");
    setError("");
  };

  const save = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const editing = editingId !== null;
      const res = await fetch("/api/owner/expenses", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(
          editing
            ? { expenseId: editingId, category, amount: value, expense_date: date, description }
            : { cafeId, category, amount: value, expense_date: date, description }
        ),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not save that.");

      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/owner/expenses", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ expenseId: id }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not delete that.");

      setConfirmingId(null);
      if (editingId === id) resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete that.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (expense: Expense) => {
    setEditingId(expense.id);
    setDate(expense.expense_date);
    setCategory(expense.category);
    setAmount(String(expense.amount));
    setDescription(expense.description || "");
    setConfirmingId(null);
    setError("");
  };

  const visible = useMemo(
    () => (filter === "all" ? expenses : expenses.filter((e) => e.category === filter)),
    [expenses, filter]
  );

  const stats = useMemo(() => {
    const total = expenses.reduce((sum, e) => sum + e.amount, 0);

    const byCategory = new Map<string, number>();
    for (const expense of expenses) {
      byCategory.set(expense.category, (byCategory.get(expense.category) || 0) + expense.amount);
    }

    const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];

    // The newest row, so a café that stopped recording can see that it did.
    // A total that quietly stops growing looks the same as a cheap month.
    const last = expenses.reduce<string | null>(
      (newest, e) => (!newest || e.expense_date > newest ? e.expense_date : newest),
      null
    );

    return { total, top, last };
  }, [expenses]);

  const categoryChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const expense of expenses) {
      counts.set(expense.category, (counts.get(expense.category) || 0) + 1);
    }

    return [
      { id: "all", label: "ALL", count: expenses.length },
      ...EXPENSE_CATEGORIES.filter((c) => counts.has(c)).map((c) => ({
        id: c,
        label: EXPENSE_CATEGORY_LABELS[c].toUpperCase(),
        count: counts.get(c),
      })),
    ];
  }, [expenses]);

  return (
    <div className="space-y-5">
      <Kpis
        items={[
          {
            label: "SPENT",
            value: rupees(stats.total),
            tone: "orange",
            sub: RANGES.find((r) => r.id === range)?.label.toLowerCase(),
          },
          {
            label: "BIGGEST",
            value: stats.top ? EXPENSE_CATEGORY_LABELS[stats.top[0] as ExpenseCategory] : "—",
            sub: stats.top ? rupees(stats.top[1]) : "nothing recorded yet",
          },
          {
            label: "ENTRIES",
            value: String(expenses.length),
            sub: expenses.length === 0 ? "add the first one below" : "in this period",
          },
          {
            label: "LAST RECORDED",
            value: stats.last ? shortDate(stats.last) : "—",
            sub: stats.last ? "keep it current" : "never",
          },
        ]}
      />

      <SectionBar
        title={editingId ? "EDIT EXPENSE" : "ADD AN EXPENSE"}
        action={
          <Chips
            items={RANGES.map((r) => ({ id: r.id, label: r.label }))}
            active={range}
            onPick={(id) => setRange(id as RangeId)}
          />
        }
      />

      <Panel className="p-4">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-[130px_150px_minmax(0,1fr)_120px_auto]">
          <Field value={date} onChange={setDate} type="date" />

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            className="h-[38px] border border-[#f2f0ea]/[0.14] bg-[#111113] px-3 font-mono text-[10.5px] tracking-[0.1em] text-[#f2f0ea] outline-none transition-colors focus:border-[#d8ff3c]"
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {EXPENSE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>

          <Field
            value={description}
            onChange={setDescription}
            placeholder="What was it for? (optional)"
          />

          <Field value={amount} onChange={setAmount} placeholder="Amount ₹" type="number" />

          <div className="flex gap-2">
            <PrimaryButton onClick={save} disabled={saving}>
              {saving ? "SAVING…" : editingId ? "UPDATE" : "ADD"}
            </PrimaryButton>
            {editingId && (
              <GhostButton onClick={resetForm} title="Cancel editing">
                <X className="h-3.5 w-3.5" />
              </GhostButton>
            )}
          </div>
        </div>

        {error && (
          <p className="mt-3 font-mono text-[10.5px] tracking-[0.08em] text-[#ff5c2b]">{error}</p>
        )}
      </Panel>

      {expenses.length > 0 && (
        <Chips items={categoryChips} active={filter} onPick={setFilter} />
      )}

      <Panel>
        <TableHead columns={COLUMNS}>
          <span>DATE</span>
          <span>CATEGORY</span>
          <span>DESCRIPTION</span>
          <span className="justify-self-end">AMOUNT</span>
          <span />
        </TableHead>

        {loading ? (
          <EmptyRow>
            <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" />
            Loading…
          </EmptyRow>
        ) : visible.length === 0 ? (
          <EmptyRow>
            {expenses.length === 0
              ? "Nothing recorded for this period. Add rent, salaries, electricity and stock as you pay them — Reports turns them into profit."
              : "Nothing in this category for this period."}
          </EmptyRow>
        ) : (
          visible.map((expense) => (
            <TableRow key={expense.id} columns={COLUMNS} edge={editingId === expense.id ? "#d8ff3c" : undefined}>
              <span className="font-mono text-[11px] text-[#f2f0ea]/70">
                {shortDate(expense.expense_date)}
              </span>

              <Tag tone="muted">{EXPENSE_CATEGORY_LABELS[expense.category].toUpperCase()}</Tag>

              <span className="truncate text-[13px] text-[#f2f0ea]/80">
                {expense.description || <span className="text-[#f2f0ea]/30">—</span>}
              </span>

              <span className="font-mono text-[13px] font-semibold text-[#f2f0ea] lg:justify-self-end">
                {rupees(expense.amount)}
              </span>

              <span className="flex justify-end gap-1.5">
                {confirmingId === expense.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => remove(expense.id)}
                      disabled={saving}
                      className="px-2 py-1 font-mono text-[9.5px] tracking-[0.1em] text-[#ff5c2b] transition-colors hover:bg-[#ff5c2b]/10 disabled:opacity-40"
                    >
                      SURE?
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingId(null)}
                      className="px-2 py-1 font-mono text-[9.5px] tracking-[0.1em] text-[#f2f0ea]/50 transition-colors hover:text-[#f2f0ea]"
                    >
                      NO
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      title="Edit"
                      onClick={() => startEdit(expense)}
                      className="p-1.5 text-[#f2f0ea]/45 transition-colors hover:text-[#f2f0ea]"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      onClick={() => setConfirmingId(expense.id)}
                      className="p-1.5 text-[#f2f0ea]/45 transition-colors hover:text-[#ff5c2b]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </span>
            </TableRow>
          ))
        )}
      </Panel>
    </div>
  );
}
