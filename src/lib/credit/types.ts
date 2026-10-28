/** A credit report, as the household keeps it: the tradelines, the marks against them, the inquiries — no SSN, no addresses. */
export type Bureau = "TransUnion" | "Equifax" | "Experian";

export interface CreditHistoryMonth { month: string; rating: string; balance?: number; pastDue?: number }

export interface CreditAccount {
  id: string;
  creditor: string;
  /** Masked account number as printed (last digits visible). */
  accountMask: string;
  adverse: boolean;
  accountType?: string;   // Revolving / Installment / Mortgage / Open
  loanType?: string;      // CREDIT CARD, AUTO LOAN, LEASE …
  responsibility?: string;
  opened?: string;        // MM/DD/YYYY as printed
  closed?: string;
  updated?: string;
  lastPayment?: string;
  balance?: number;
  pastDue?: number;
  monthlyPayment?: number;
  highBalance?: number;
  creditLimit?: number;
  payStatus?: string;
  terms?: string;
  remarks?: string;
  maxDelinquency?: string;
  removalEstimate?: string;
  /** Everything the bureau printed, by its own label — nothing lost even if we don't model it. */
  fields: Record<string, string>;
  history: CreditHistoryMonth[];
  /** Counts of late marks in the payment history. */
  lates: { d30: number; d60: number; d90: number; d120: number; chargeOff: number; collection: number };
  status: "open" | "closed";
}

export interface CreditInquiry { name: string; dates: string[]; kind: "regular" | "promotional" | "review" }

export interface CreditReport {
  id: string;
  bureau: Bureau;
  /** Whose report. */
  person: string;
  reportDate: string;     // as printed, MM/DD/YYYY
  importedAt: string;     // ISO
  accounts: CreditAccount[];
  inquiries: CreditInquiry[];
  publicRecords: string[];
  summary: { open: number; closed: number; adverse: number; totalBalance: number; totalLimit: number; utilization: number | null; hardInquiries: number; collections: number };
}

/** Positioned text from a PDF page (what pdf.js gives us), the parser's only input. */
export interface TextItem { s: string; x: number; y: number; w: number }
