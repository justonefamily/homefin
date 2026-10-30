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
  /** Came from a credit report: "creditor|mask" so a re-import can refresh the balance. */
  creditRef?: string;
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
  /** First month this bill applied (YYYY-MM). Before it, the bill doesn't count. */
  startedOn?: string;
  /** Last month this bill applied (YYYY-MM). After it, the bill is history — it's kept for the record but no longer due. */
  endedOn?: string;
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
  /** Fallback recommendation when there's no spending history for this category. */
  defaultLimit?: number;
  /** Maps the category into 50/30/20 and 6 Cans buckets. "reimbursable" = money you front and get back (work expenses,
   *  splitting a bill with friends) — left out of spending, and the deposit that returns it counts as income. */
  bucket: "needs" | "wants" | "savings" | "giving" | "education" | "play" | "reimbursable";
  /** Who manages this category — id of a column in settings.budgetManagers. Unset = unassigned. */
  managerId?: string;
}

/** A "manager" column on the Budget page: a person in the home who owns a set of categories. */
export interface BudgetManager { id: string; name: string; /** home member user id, when picked from the home */ userId?: string }

export interface Transaction {
  id: string;
  accountId?: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // positive = money out
  category: string; // budget category id
  /** Set at sync when the bank says this is a transfer between accounts (card payment, savings move) — not spending. */
  transfer?: boolean;
  /** Plaid's detailed personal-finance category, kept so we can re-classify later. */
  pfc?: string;
  /** This one transaction belongs to a different merchant than its description says (set from the item page). */
  merchantOverride?: string;
  /** Where this payment landed — one of your own loan/card accounts. Matched from the receiving side's credit, or set by hand. */
  toAccountId?: string;
  /** True when toAccountId was chosen by hand (sync won't change it). */
  toAccountManual?: boolean;
}

/** A credit received on a loan or card account — the payment arriving on the other side. Used to tell which account a bank payment went to. */
export interface Credit { id: string; accountId: string; date: string; amount: number; description: string; }

/** How the household wants a merchant treated. Keyed by merchant key (see detect.ts merchantKey). */
export interface MerchantPref {
  /** Display name override. */
  name?: string;
  /** This merchant is really the same as that one — its transactions roll up there. */
  mergedInto?: string;
  /** "transfer" = money moving between your own accounts (excluded from spending); "ignore" = hide entirely. */
  kind?: "spend" | "transfer" | "ignore";
  /** Budget category override for every transaction at this merchant. */
  category?: string;
  /** This payment brings down a tracked loan or card (an Account of kind credit/loan/mortgage). Money out, but toward a balance. */
  paysDownAccountId?: string;
  /** Not an everyday spend — a one-off or seasonal cost (the cruise, the car repair). Still counts in totals, but
   *  lives outside the Everyday section and the everyday average the plan uses. */
  occasional?: boolean;
}

export interface PaySchedule {
  /** Net income per month. */
  monthlyIncome: number;
  /** Days of month paychecks land. [1, 16] = twice-monthly. */
  payDays: number[];
  /** Pay-period boundary when periods are month halves — the 1st–15th / 16th–end split. */
  splitDay: number; // 15
  /** "halves" (default): 1st–splitDay and splitDay+1–end. "paydays": each period starts on a payday and runs to the day before the next one
   *  (paid the 15th and 30th → 15th–29th, then 30th–14th of next month). */
  periodMode?: "halves" | "paydays" | "custom";
  /** Explicit pay periods ("custom"): each paycheck and the days it covers. `to` smaller than `from` means it runs into the next month
   *  (paid the 30th, covers 30 → 14 = the 30th through the 14th of next month). */
  periods?: { payDay: number; from: number; to: number }[];
  /** Income landing on or after this day of the month counts toward the NEXT month (a Sep 30 check pays for October).
   *  Unset = income belongs to the calendar month it landed in. */
  incomeRollDay?: number;
}

export interface Settings {
  strategy: StrategyId;
  extraPayment: number; // $/mo thrown at debt
  reminderDays: number;
  starterFundGoal: number; // Baby Step 1
  emergencyMonths: number; // Baby Step 3
  /** Monthly estimate of everyday spending (groceries, gas, etc.) used in projections. */
  everydaySpend: number;
  /** What planned months are built from: "estimate" = bills + the everyday estimate above; "budget" = the budget limits
   *  (bills are already inside their categories, so everyday = budget total − bills). */
  planBasis?: "estimate" | "budget";
  /** How far back to pull transactions when linking a bank (days). Plaid's maximum is 730 (24 months). */
  historyDays?: number;
  /** Merchant keys the user said are "not a bill". */
  dismissedSuggestions?: string[];
  /** Plaid account ids the user hid — sync skips them without disconnecting the bank. */
  hiddenAccounts?: string[];
  /** Manager columns on the Budget page (who owns which categories). Empty = one plain list. */
  budgetManagers?: BudgetManager[];
  /** Set once every linked bank has been re-pulled from the start to collect loan/card credits (payment destinations). */
  creditsBackfilledAt?: string;
  /** Merchant pairs the user said are NOT the same place ("keyA|keyB", sorted) — never suggested again. */
  notSamePlace?: string[];
  /** Deposit merchant keys the user said are not income sources. */
  dismissedIncome?: string[];
  /** When true, budget limits reset to last quarter's averages automatically at each quarter start. */
  autoApplyBudgetRecommendations?: boolean;
  /** The quarter (e.g. "2026-Q4") whose recommendations were last applied. */
  budgetsAppliedForQuarter?: string;
  /** Per-merchant decisions: merges, renames, transfer/ignore, category. */
  merchants?: Record<string, MerchantPref>;
  /** Year-plan targets by year: what you want the year to end at. */
  yearTargets?: Record<string, YearTargets>;
}

export interface YearTargets {
  /** In your pocket at year end. */
  pocket?: number;
  /** Debt remaining at year end (0 = debt-free). */
  debt?: number;
  /** Total income for the year. */
  income?: number;
  /** Total spending (bills + everyday + landmarks) for the year. */
  spending?: number;
  /** Set aside / given for the year. */
  saved?: number;
}

/** A balance reading for an account on a date — Plaid sync appends one each run. Powers debt/net-worth history. */
export interface BalancePoint { accountId: string; date: string; balance: number; }

/** Money actually received (Plaid deposits or manual). `status` is the user's call: counted as income, or ignored (transfers, refunds). */
export interface IncomeEvent {
  /** counted = income · ignored = not money of ours · refund = a merchant giving money back (offsets spending, not income) */
  id: string; date: string; amount: number; source: string; sourceId?: string; status?: "counted" | "ignored" | "refund";
  /** Account the deposit landed in (Plaid). */
  accountId?: string;
  /** True when this deposit was matched to money leaving another of your accounts — an internal transfer, auto-ignored. */
  internal?: boolean;
}

/** An expected, recurring income — a paycheck or other regular money in. Actual deposits attach to it as IncomeEvents. */
export interface IncomeSource {
  id: string;
  name: string;
  kind: "paycheck" | "other";
  /** Normalized merchant key used to match deposits automatically. */
  merchant?: string;
  /** Expected amount per deposit. */
  expected: number;
  cadence: "weekly" | "biweekly" | "semimonthly" | "monthly";
  /** Days of month for semimonthly/monthly; approximate for weekly/biweekly. */
  payDays: number[];
}

/** A planned, dated expense (or windfall) for the year plan: a trip, tuition, a wedding, a tax refund. */
export interface Landmark {
  id: string;
  name: string;
  /** YYYY-MM */
  month: string;
  /** Positive = money out (default). Negative = money in (a refund, bonus). */
  amount: number;
  note?: string;
  category?: string;
}

export type Course = "main" | "side" | "meat" | "veggie" | "dessert" | "drink";

/** A favorite dish — the household's own menu, itemized by course. Feeds the meal dropdowns on the calendar. */
export interface Dish {
  id: string;
  name: string;
  course: Course;
  /** e.g. ["healthy", "quick", "kid-friendly"] */
  tags?: string[];
  notes?: string;
  /** Optional link to a recipe. */
  url?: string;
  /** What you need to make it — feeds the grocery list. */
  ingredients?: string[];
}

/** One course inside a planned meal: "sides: rice, beans". Multiple per course allowed. */
export interface MealComponent { course: Course; dishId: string; }

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

/** Something planned on the home calendar: a meal (from a dish), a project, or an event. */
export interface CalendarItem {
  id: string;
  date: string; // YYYY-MM-DD
  kind: "meal" | "project" | "event";
  slot?: MealSlot;      // meals only
  dishId?: string;      // the main dish (from the library)
  components?: MealComponent[]; // sides, meats, veggies, desserts, drinks that go with it
  title: string;        // main dish name snapshot, or the project/event name
  notes?: string;
  done?: boolean;       // projects/events (and "cooked" for meals)
  assignee?: string;    // a member's name
}

/** A "look at this later" marker. `ref` is the merchant key, transaction id, or deposit id. */
export interface Flag { id: string; kind: "merchant" | "transaction" | "deposit"; ref: string; label: string; note?: string; at: string; done?: boolean }

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
  incomeSources?: IncomeSource[];
  landmarks?: Landmark[];
  dishes?: Dish[];
  calendar?: CalendarItem[];
  /** Grocery list state per week (key = YYYY-MM-DD of the Sunday): items checked off, and extras typed by hand. */
  grocery?: Record<string, { checked: string[]; extras: string[] }>;
  /** Payments received on loan/card accounts (the receiving side of your own payments). Undefined = never collected yet → next sync re-pulls history. */
  credits?: Credit[];
  /** Things flagged for a later look: a whole merchant, one transaction, or one deposit. */
  flags?: Flag[];
  /** Imported credit reports (parsed on-device; no SSN or addresses kept). See lib/credit. */
  credit?: { reports: import("./credit/types").CreditReport[] };
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
