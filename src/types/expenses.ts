// Expense Types

/**
 * What the café spends money on.
 *
 * A fixed list rather than free text, because the point of recording expenses
 * is comparing one month against the next: "Electricty" and "electricity bill"
 * typed on different evenings are two rows that should have been one, and no
 * report can put them back together afterwards.
 *
 * The database has no CHECK on the column, so this list is the only thing
 * holding the set together. Add to it here rather than typing a new value in.
 */
export const EXPENSE_CATEGORIES = [
  'rent',
  'salaries',
  'electricity',
  'internet',
  'stock',
  'maintenance',
  'marketing',
  'other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  rent: 'Rent',
  salaries: 'Salaries',
  electricity: 'Electricity',
  internet: 'Internet',
  stock: 'Stock',
  maintenance: 'Maintenance',
  marketing: 'Marketing',
  other: 'Other',
};

export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return EXPENSE_CATEGORIES.includes(value as ExpenseCategory);
}

export interface Expense {
  id: string;
  cafe_id: string;
  category: ExpenseCategory;
  description: string | null;
  amount: number;
  expense_date: string;
  created_at: string;
}
