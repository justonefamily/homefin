import type { CreditAccount, CreditHistoryMonth, CreditInquiry, CreditReport, TextItem } from "./types";

/**
 * TransUnion consumer report parser. Works from positioned text (pdf.js), reconstructs rows, and reads each account as
 * label rows + value rows — the way the report is laid out — so it survives the bureau shuffling which labels appear.
 * Only the report's own structure is here; no real data.
 */

interface Cell { x: number; w: number; s: string }
interface Row { y: number; cells: Cell[]; text: string }

const LABELS = new Set([
  "Address", "Phone", "Monthly Payment", "Date Opened", "Responsibility", "Account Type", "Loan Type", "Balance", "Date Updated",
  "Payment Received", "Last Payment Made", "Pay Status", "Terms", "Date Closed", "Estimated month and year this item will be removed",
  "Maximum Delinquency Note", "High Balance (Hist.)", "Credit Limit (Hist.)", "High Balance", "Credit Limit", "Remarks", "Past Due",
  "Original Creditor", "Original Amount", "Date Paid", "Collateral", "Date Paid Out", "Pay Status (Hist.)", "Balance (Hist.)", "Scheduled Payment",
  "Original Balance", "Date of 1st Delinquency", "Payment Frequency", "Credit Limit (Hist.):", "Account Name", "Account Number",
]);
const RATINGS = new Set(["OK", "X", "30", "60", "90", "120", "COL", "VS", "RPO", "C/O", "FC", "N/R"]);
const MONTH = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})$/;

/** Group items into rows (same baseline), merge touching fragments into cells, sort left→right. */
export function toRows(items: TextItem[]): Row[] {
  const buckets = new Map<number, TextItem[]>();
  for (const it of items) {
    if (!it.s.trim()) continue;
    const y = Math.round(it.y);
    const key = [...buckets.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(it);
  }
  return [...buckets.entries()].sort((a, b) => b[0] - a[0]).map(([y, its]) => {
    const sorted = its.sort((a, b) => a.x - b.x);
    const cells: Cell[] = [];
    for (const it of sorted) {
      const last = cells[cells.length - 1];
      const gap = last ? it.x - (last.x + last.w) : Infinity;
      // Fragments of one word arrive as separate items with a hairline gap (and sometimes a stray leading space): glue them.
      if (last && gap < 1.5) { last.s += it.s.replace(/^\s+/, ""); last.w = it.x + it.w - last.x; }
      else cells.push({ x: it.x, w: it.w, s: it.s });
    }
    for (const c of cells) c.s = c.s.replace(/\s+/g, " ").trim();
    return { y, cells: cells.filter((c) => c.s), text: cells.map((c) => c.s).join(" ").trim() };
  });
}

const money = (s?: string) => { if (!s) return undefined; const m = s.replace(/,/g, "").match(/-?\$?\s*(\d+(?:\.\d+)?)/); return m ? Number(m[1]) : undefined; };
const isLabelRow = (r: Row) => r.cells.length > 0 && r.cells.every((c) => LABELS.has(c.s.replace(/:$/, "")));

function finishAccount(a: Partial<CreditAccount> & { fields: Record<string, string>; history: CreditHistoryMonth[] }, adverse: boolean, idx: number): CreditAccount {
  const f = a.fields;
  const lates = { d30: 0, d60: 0, d90: 0, d120: 0, chargeOff: 0, collection: 0 };
  for (const h of a.history) { if (h.rating === "30") lates.d30++; else if (h.rating === "60") lates.d60++; else if (h.rating === "90") lates.d90++; else if (h.rating === "120") lates.d120++; else if (h.rating === "C/O") lates.chargeOff++; else if (h.rating === "COL") lates.collection++; }
  const payStatus = f["Pay Status"];
  const closed = f["Date Closed"] || /closed|paid|sold|transferred|charge/i.test(payStatus ?? "") ? "closed" : "open";
  return {
    id: `${idx}-${(a.creditor ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${(a.accountMask ?? "").slice(-6)}`,
    creditor: a.creditor ?? "Unknown", accountMask: a.accountMask ?? "", adverse,
    accountType: f["Account Type"], loanType: f["Loan Type"], responsibility: f["Responsibility"],
    opened: f["Date Opened"], closed: f["Date Closed"], updated: f["Date Updated"], lastPayment: f["Last Payment Made"],
    balance: money(f["Balance"]), pastDue: money(f["Past Due"]), monthlyPayment: money(f["Monthly Payment"]),
    highBalance: money(f["High Balance"]) ?? money(f["High Balance (Hist.)"]), creditLimit: money(f["Credit Limit"]) ?? money(f["Credit Limit (Hist.)"]),
    payStatus, terms: f["Terms"], remarks: f["Remarks"], maxDelinquency: f["Maximum Delinquency Note"], removalEstimate: f["Estimated month and year this item will be removed"],
    fields: f, history: a.history, lates, status: closed,
  };
}

export function parseTransUnion(pages: TextItem[][], opts: { person: string; id: string; importedAt: string }): CreditReport {
  const rows = pages.flatMap(toRows).filter((r) => !/^\d+ \/ \d+$/.test(r.text)); // drop "3 / 25" page footers
  let reportDate = "";
  const accounts: CreditAccount[] = [];
  const inquiries: CreditInquiry[] = [];
  const publicRecords: string[] = [];
  let section: "none" | "adverse" | "satisfactory" | "inq-regular" | "inq-promotional" | "inq-review" | "public" = "none";
  let cur: (Partial<CreditAccount> & { fields: Record<string, string>; history: CreditHistoryMonth[] }) | null = null;
  let labels: Cell[] = [];
  let inHistory = false;
  let monthCols: { x: number; month: string }[] = [];
  const flush = () => { if (cur) { accounts.push(finishAccount(cur, section === "adverse", accounts.length)); cur = null; } labels = []; inHistory = false; monthCols = []; };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const t = r.text;
    if (/^Date Created:?$/.test(t) && rows[i + 1]) { reportDate = rows[i + 1].text; continue; }
    if (/^Accounts with Adverse Information$/i.test(t)) { flush(); section = "adverse"; continue; }
    if (/^Satisfactory Accounts$/i.test(t)) { flush(); section = "satisfactory"; continue; }
    if (/^Regular Inquiries$/i.test(t)) { flush(); section = "inq-regular"; continue; }
    if (/^Promotional Inquiries$/i.test(t)) { flush(); section = "inq-promotional"; continue; }
    if (/^Account Review Inquiries$/i.test(t)) { flush(); section = "inq-review"; continue; }
    if (/^Public Records$/i.test(t)) { flush(); section = "public"; continue; }
    if (/^(Consumer Statement|Promotional opt-out|SUMMARY OF RIGHTS|Your Rights)/i.test(t)) { flush(); section = "none"; continue; }

    if (section === "adverse" || section === "satisfactory") {
      if (/^Account Name\s+Account Number$/.test(t) || (r.cells[0]?.s === "Account Name" && r.cells[1]?.s === "Account Number")) {
        flush();
        const next = rows[++i];
        if (!next) break;
        const left = next.cells.filter((c) => c.x < 300).map((c) => c.s).join(" ");
        const right = next.cells.filter((c) => c.x >= 300).map((c) => c.s).join("");
        cur = { creditor: left, accountMask: right, fields: {}, history: [] };
        continue;
      }
      if (!cur) continue;
      if (/^Payment History$/i.test(t)) { inHistory = true; labels = []; continue; }
      if (inHistory) {
        if (r.cells.every((c) => MONTH.test(c.s))) { monthCols = r.cells.map((c) => ({ x: c.x, month: c.s })); continue; }
        if (monthCols.length && r.cells.every((c) => RATINGS.has(c.s) || /^[A-Z]{2,3}\/>?[A-Z]{2,3}<?$/.test(c.s))) {
          for (const c of r.cells) { const col = monthCols.filter((m) => m.x <= c.x + 4).pop(); if (!col || !RATINGS.has(c.s)) continue; const mk = col.month; const ex = cur.history.find((h) => h.month === mk); if (ex) ex.rating = c.s; else cur.history.push({ month: mk, rating: c.s }); }
          continue;
        }
        if (monthCols.length && /^(Bal:|Past Due:)/.test(r.cells[0]?.s ?? "")) {
          for (let k = 0; k < r.cells.length; k++) {
            const c = r.cells[k];
            if (c.s !== "Bal:" && c.s !== "Past Due:") continue;
            const val = r.cells[k + 1]; if (!val) continue;
            const col = monthCols.filter((m) => m.x <= c.x + 4).pop(); if (!col) continue;
            const h = cur.history.find((x) => x.month === col.month) ?? (cur.history.push({ month: col.month, rating: "" }), cur.history[cur.history.length - 1]);
            if (c.s === "Bal:") h.balance = money(val.s); else h.pastDue = money(val.s);
          }
          continue;
        }
        continue;
      }
      if (isLabelRow(r)) { labels = r.cells.map((c) => ({ ...c, s: c.s.replace(/:$/, "") })); for (const l of labels) if (!(l.s in cur.fields)) cur.fields[l.s] = ""; continue; }
      if (labels.length) {
        for (const c of r.cells) {
          const label = labels.filter((l) => l.x <= c.x + 3).pop() ?? labels[0];
          cur.fields[label.s] = (cur.fields[label.s] ? cur.fields[label.s] + " " : "") + c.s;
        }
      }
      continue;
    }

    if (section.startsWith("inq-")) {
      const kind = section === "inq-regular" ? "regular" : section === "inq-promotional" ? "promotional" : "review";
      if (/^Name\s+Requested On$/.test(t) || r.cells[0]?.s === "Name") continue;
      if (/^(Location|Permissible Purpose)$/.test(r.cells[0]?.s ?? "") || /^(Location|Permissible Purpose)\b/.test(t)) { i++; continue; }
      const dates = r.cells.filter((c) => c.x >= 300 && /\d{2}\/\d{2}\/\d{4}/.test(c.s)).flatMap((c) => c.s.split(/,\s*/));
      const nameCells = r.cells.filter((c) => c.x < 300);
      if (nameCells.length && dates.length) inquiries.push({ name: nameCells.map((c) => c.s).join(" "), dates, kind });
      else if (!nameCells.length && dates.length && inquiries.length) inquiries[inquiries.length - 1].dates.push(...dates);
      continue;
    }
    if (section === "public" && t && !/^(Public Records|The following)/.test(t)) publicRecords.push(t);
  }
  flush();

  const open = accounts.filter((a) => a.status === "open");
  const revolving = open.filter((a) => /revolving/i.test(a.accountType ?? "") && a.creditLimit);
  const limit = revolving.reduce((s, a) => s + (a.creditLimit ?? 0), 0);
  const revBal = revolving.reduce((s, a) => s + (a.balance ?? 0), 0);
  return {
    id: opts.id, bureau: "TransUnion", person: opts.person, reportDate, importedAt: opts.importedAt, accounts, inquiries, publicRecords,
    summary: {
      open: open.length, closed: accounts.length - open.length, adverse: accounts.filter((a) => a.adverse).length,
      totalBalance: open.reduce((s, a) => s + (a.balance ?? 0), 0), totalLimit: limit, utilization: limit ? Math.round((revBal / limit) * 100) : null,
      hardInquiries: inquiries.filter((q) => q.kind === "regular").reduce((s, q) => s + q.dates.length, 0),
      collections: accounts.filter((a) => /collection/i.test(`${a.payStatus} ${a.remarks} ${a.loanType}`) || a.lates.collection > 0).length,
    },
  };
}
