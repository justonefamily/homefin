import type { HomeData } from "./types";

/**
 * Sample home used by "Try it with sample data" and by tests. Never loaded unless the
 * user asks for it — real data always comes from the chosen storage.
 */
export const sampleHome = (now = new Date()): HomeData => {
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const day = (d: number) => `${ym}-${String(d).padStart(2, "0")}`;
  const syncedAt = new Date(now.getTime() - 2 * 60_000).toISOString();
  const lyKey = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const ly = (d: number) => `${lyKey}-${String(d).padStart(2, "0")}`;
  // Last-year history for the same month (so "this time last year" has something to compare).
  const lastYearTx = [
    { id: "ly1", accountId: "chk", date: ly(2), description: "Publix", amount: 188, category: "groceries" },
    { id: "ly2", accountId: "chk", date: ly(9), description: "Publix", amount: 176, category: "groceries" },
    { id: "ly3", accountId: "chk", date: ly(16), description: "Publix", amount: 191, category: "groceries" },
    { id: "ly4", accountId: "chk", date: ly(5), description: "Shell", amount: 55, category: "transport" },
    { id: "ly5", accountId: "chk", date: ly(19), description: "Shell", amount: 58, category: "transport" },
    { id: "ly6", accountId: "cs", date: ly(7), description: "Chili's", amount: 62, category: "dining" },
    { id: "ly7", accountId: "cs", date: ly(21), description: "Pizza", amount: 38, category: "dining" },
    { id: "ly8", accountId: "cs", date: ly(11), description: "Netflix", amount: 18, category: "subs" },
  ];
  const lastYearPayments = [
    { billId: "b1", month: lyKey, paidAt: ly(1), amount: 1850 }, { billId: "b9", month: lyKey, paidAt: ly(2), amount: 600 },
    { billId: "b2", month: lyKey, paidAt: ly(8), amount: 160 }, { billId: "b3", month: lyKey, paidAt: ly(12), amount: 85 },
    { billId: "b4", month: lyKey, paidAt: ly(15), amount: 420 }, { billId: "b5", month: lyKey, paidAt: ly(20), amount: 260 },
    { billId: "b6", month: lyKey, paidAt: ly(22), amount: 140 }, { billId: "b7", month: lyKey, paidAt: ly(26), amount: 50 },
    { billId: "b8", month: lyKey, paidAt: ly(28), amount: 170 },
  ];
  return {
    balanceHistory: [
      { accountId: "cs", date: ly(28), balance: 5600 }, { accountId: "auto", date: ly(28), balance: 15900 }, { accountId: "stu", date: ly(28), balance: 20100 },
      { accountId: "store", date: ly(28), balance: 400 }, { accountId: "mtg", date: ly(28), balance: 241300 }, { accountId: "sav", date: ly(28), balance: 250 },
      { accountId: "cs", date: day(27), balance: 4200 }, { accountId: "auto", date: day(27), balance: 11800 }, { accountId: "stu", date: day(27), balance: 18500 },
      { accountId: "store", date: day(27), balance: 900 }, { accountId: "mtg", date: day(27), balance: 238400 }, { accountId: "sav", date: day(27), balance: 600 },
    ],
    income: [
      { id: "i1", date: ly(1), amount: 3000, source: "Paycheck" }, { id: "i2", date: ly(16), amount: 3000, source: "Paycheck" },
      { id: "i3", date: day(1), amount: 3200, source: "Paycheck" }, { id: "i4", date: day(16), amount: 3200, source: "Paycheck" },
    ],
    version: 1,
    homeName: "The Abraham home",
    pay: { monthlyIncome: 6400, payDays: [1, 16], splitDay: 15 },
    settings: { strategy: "snowball", extraPayment: 500, reminderDays: 3, starterFundGoal: 1000, emergencyMonths: 3, everydaySpend: 1680 },
    accounts: [
      { id: "chk", name: "Chase Total Checking", institution: "Chase", kind: "checking", balance: 2340, mask: "4417", source: "plaid", lastSyncedAt: syncedAt },
      { id: "sav", name: "Ally Savings", institution: "Ally", kind: "savings", balance: 600, mask: "0921", source: "plaid", lastSyncedAt: syncedAt },
      { id: "store", name: "Store card", institution: "Synchrony", kind: "credit", balance: 900, apr: 27.9, minPayment: 35, source: "manual" },
      { id: "cs", name: "Chase Sapphire", institution: "Chase", kind: "credit", balance: 4200, apr: 24.9, minPayment: 110, mask: "8812", source: "plaid", lastSyncedAt: syncedAt },
      { id: "auto", name: "Car loan", institution: "Capital One Auto", kind: "loan", balance: 11800, apr: 6.4, minPayment: 420, source: "plaid", lastSyncedAt: syncedAt },
      { id: "stu", name: "Student loan", institution: "Nelnet", kind: "loan", balance: 18500, apr: 5.2, minPayment: 210, source: "manual" },
      { id: "mtg", name: "Rocket Mortgage", institution: "Rocket", kind: "mortgage", balance: 238400, apr: 6.1, minPayment: 1850, source: "manual" },
      { id: "att", name: "AT&T", institution: "AT&T", kind: "biller", balance: 140, source: "email", lastSyncedAt: syncedAt },
      { id: "xf", name: "Xfinity", institution: "Xfinity", kind: "biller", balance: 95, source: "email", lastSyncedAt: syncedAt },
      { id: "duke", name: "Duke Energy", institution: "Duke Energy", kind: "biller", balance: 160, source: "email", lastSyncedAt: syncedAt },
      { id: "ck", name: "Credit Karma", institution: "TransUnion & Equifax", kind: "credit-score", balance: 712, source: "manual" },
    ],
    bills: [
      { id: "b1", name: "Rocket Mortgage", accountId: "mtg", category: "housing", amount: 1850, dueDay: 1, autopay: true, cadence: "monthly" },
      { id: "b2", name: "AT&T Wireless", accountId: "att", category: "utilities", amount: 140, dueDay: 8, autopay: true, cadence: "monthly" },
      { id: "b3", name: "Xfinity", accountId: "xf", category: "utilities", amount: 95, dueDay: 12, autopay: false, cadence: "monthly" },
      { id: "b4", name: "Car loan", accountId: "auto", category: "transport", amount: 420, dueDay: 15, autopay: true, cadence: "monthly" },
      { id: "b5", name: "Chase Sapphire", accountId: "cs", category: "debt", amount: 310, dueDay: 20, autopay: false, cadence: "monthly" },
      { id: "b6", name: "Electric", accountId: "duke", category: "utilities", amount: 160, dueDay: 22, autopay: false, cadence: "monthly" },
      { id: "b7", name: "Water & sewer", category: "utilities", amount: 55, dueDay: 26, autopay: true, cadence: "monthly" },
      { id: "b8", name: "Car insurance", category: "transport", amount: 185, dueDay: 28, autopay: true, cadence: "monthly" },
      { id: "b9", name: "Tithe", category: "giving", amount: 640, dueDay: 2, autopay: false, cadence: "monthly" },
    ],
    payments: [
      { billId: "b1", month: ym, paidAt: day(1), amount: 1850 },
      { billId: "b9", month: ym, paidAt: day(2), amount: 640 },
      { billId: "b2", month: ym, paidAt: day(8), amount: 140 },
      { billId: "b3", month: ym, paidAt: day(12), amount: 95 },
      { billId: "b4", month: ym, paidAt: day(15), amount: 420 },
      { billId: "b5", month: ym, paidAt: day(20), amount: 310 },
      ...lastYearPayments,
    ],
    budgets: [
      { id: "housing", name: "Housing", limit: 1850, bucket: "needs" },
      { id: "utilities", name: "Utilities & phone", limit: 450, bucket: "needs" },
      { id: "groceries", name: "Groceries", limit: 800, bucket: "needs" },
      { id: "transport", name: "Transportation", limit: 650, bucket: "needs" },
      { id: "dining", name: "Dining out", limit: 300, bucket: "wants" },
      { id: "subs", name: "Subscriptions", limit: 120, bucket: "wants" },
      { id: "debt", name: "Credit card payments", limit: 310, bucket: "savings" },
      { id: "giving", name: "Giving", limit: 640, bucket: "giving" },
    ],
    transactions: [
      { id: "t1", accountId: "chk", date: day(3), description: "Publix", amount: 212, category: "groceries" },
      { id: "t2", accountId: "chk", date: day(6), description: "Shell", amount: 48, category: "transport" },
      { id: "t3", accountId: "cs", date: day(9), description: "Chick-fil-A", amount: 34, category: "dining" },
      { id: "t4", accountId: "chk", date: day(10), description: "Publix", amount: 198, category: "groceries" },
      { id: "t5", accountId: "cs", date: day(11), description: "Netflix", amount: 23, category: "subs" },
      { id: "t6", accountId: "cs", date: day(14), description: "Olive Garden", amount: 96, category: "dining" },
      { id: "t7", accountId: "chk", date: day(17), description: "Publix", amount: 230, category: "groceries" },
      { id: "t8", accountId: "cs", date: day(18), description: "Spotify", amount: 12, category: "subs" },
      { id: "t9", accountId: "chk", date: day(21), description: "Shell", amount: 52, category: "transport" },
      { id: "t10", accountId: "cs", date: day(24), description: "Chipotle", amount: 41, category: "dining" },
      { id: "t11", accountId: "cs", date: day(25), description: "Disney+", amount: 14, category: "subs" },
      { id: "t12", accountId: "cs", date: day(26), description: "Dinner out", amount: 148, category: "dining" },
      ...lastYearTx,
    ],
  };
};
