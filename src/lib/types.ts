/**
 * Domain types. Everything a "home" owns lives in one HomeData document.
 * That document is what gets saved to Supabase / a local file / Google Drive / OneDrive,
 * and what the 7-day snapshot history rolls back.
 */

export type StrategyId = "snowball" | "avalanche" | "baby" | "503020" | "sixcans";

export type AccountKind = "checking" | "savings" | "credit" | "loan" | "mortgage" | "biller" | "credit-score";

export interface Account {
  id: string;
  name: string;
  institution: string;
  kind: AccountKind;
  /** Positive balance for assets; amount owed for credit/loan/mortgage. */
  balance: number;
  mask?: string; // last 4
  apr?: number;
  minPayment?: number;
  /** "plaid" | "manual" | "email" | "csv" */
  source: "plaid" | "manual" | "email" | "csv";
  plaidItemId?: string;
  lastSyncedAt?: string; // ISO
  /** Institution brand color (from Plaid, or the built-in palette) and logo (data URL from Plaid). */
  brandColor?: string;
  logo?: string;
}

export interface Bill {
  id: string;
  name: string;
  accountId?: string;
  category: string; // budget category id
  amount: number;
  /** Day of month 1–31. */
  dueDay: number;
  autopay: boolean;
  /** "monthly" only for now; keep the field so we can add weekly/yearly. */
  cadence: "monthly";
  /** Normalized merchant key when the bill was detected from (or matched to) bank transactions. */
  merchant?: string;
}

export interface BillPayment {
  billId: string;
  /** "YYYY-MM" */
  month: string;
  paidAt: string; // ISO
  amount: number;
}

export interface BudgetCategory {
  id: string;
  name: string;
  limit: number; // monthly
  /** Maps the category into 50/30/20 and 6 Cans buckets. */
  bucket: "needs" | "wants" | "savings" | "giving" | "education" | "play";
}

export interface Transaction {
  id: string;
  accountId?: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // positive = money out
  category: string; // budget category id
}

export interface PaySchedule {
  /** Net income per month. */
  monthlyIncome: number;
  /** Days of month paychecks land. [1, 16] = twice-monthly. */
  payDays: number[];
  /** Pay-period boundary — the 1st–15th / 16th–end split. */
  splitDay: number; // 15
}

export interface Settings {
  strategy: StrategyId;
  extraPayment: number; // $/mo thrown at debt
  reminderDays: number;
  starterFundGoal: number; // Baby Step 1
  emergencyMonths: number; // Baby Step 3
  /** Monthly estimate of everyday spending (groceries, gas, etc.) used in projections. */
  everydaySpend: number;
  /** How far back to pull transactions when linking a bank (days). Plaid's maximum is 730 (24 months). */
  historyDays?: number;
  /** Merchant keys the user said are "not a bill". */
  dismissedSuggestions?: string[];
}

/** A balance reading for an account on a date — Plaid sync appends one each run. Powers debt/net-worth history. */
export interface BalancePoint { accountId: string; date: string; balance: number; }

/** Income actually received (Plaid deposits or manual). Optional — projections fall back to `pay.monthlyIncome`. */
export interface IncomeEvent { id: string; date: string; amount: number; source: string; }

export interface HomeData {
  version: 1;
  homeName: string;
  pay: PaySchedule;
  settings: Settings;
  accounts: Account[];
  bills: Bill[];
  payments: BillPayment[];
  budgets: BudgetCategory[];
  transactions: Transaction[];
  balanceHistory?: BalancePoint[];
  income?: IncomeEvent[];
  /** The Focus board: widgets the household composed. See lib/widgets.ts. */
  dashboard?: { widgets: import("./widgets").Widget[] };
  /** True once the welcome screen has been completed, so an empty-but-created home opens straight into the app. */
  setupDone?: boolean;
}

export interface Snapshot {
  id: string;
  takenAt: string; // ISO
  by: string; // display name or "auto-save"
  note: string;
}

export interface HomeMember {
  userId: string;
  name: string;
  email: string;
  role: "owner" | "editor" | "viewer";
}

export interface Invite {
  id: string;
  email: string;
  role: "editor" | "viewer";
  createdAt: string;
}

export const emptyHome = (name = "My home"): HomeData => ({
  version: 1,
  homeName: name,
  pay: { monthlyIncome: 0, payDays: [1, 16], splitDay: 15 },
  settings: { strategy: "snowball", extraPayment: 0, reminderDays: 3, starterFundGoal: 1000, emergencyMonths: 3, everydaySpend: 0 },
  accounts: [],
  bills: [],
  payments: [],
  budgets: [],
  transactions: [],
  balanceHistory: [],
  income: [],
});
