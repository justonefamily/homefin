/**
 * Runs a bank sync from the browser as a series of short requests (see /api/plaid/sync): accounts for each bank, then
 * transactions page by page until each bank says it has no more, then one finalize pass. Reports progress per bank so
 * the UI can draw a bar for each and one for the whole thing. Keeps going until every bank is done — there's no single
 * long request to time out.
 */
export interface BankProgress { id: string; /** Plaid item id — what accounts carry as plaidItemId */ itemId: string; name: string; state: "waiting" | "accounts" | "transactions" | "done" | "pending" | "failed"; /** 0–1 */ progress: number; pages: number; transactions: number; message?: string }
export interface SyncProgress { banks: BankProgress[]; /** 0–1 across everything, finalize included */ overall: number; phase: "listing" | "banks" | "finalize" | "done" | "failed"; message?: string }
export interface SyncResult { accounts: number; transactions: number; autoPaid: number; pending: string[]; problems: string[]; failed: boolean }

const post = async (body: unknown) => {
  const r = await fetch("/api/plaid/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const text = await r.text();
  let j: Record<string, unknown>;
  try { j = JSON.parse(text); } catch { throw new Error(r.status === 504 || r.status === 408 ? "timed out — the bank took too long to answer" : `sync failed (${r.status})`); }
  if (!r.ok) throw new Error((j.error as string) ?? "sync failed");
  return j;
};

/** Progress inside a bank: accounts are the first fifth; each transactions page closes a third of what's left (so it climbs but never hits 100 until the bank says done). */
const txProgress = (pages: number) => 0.2 + 0.78 * (1 - Math.pow(2 / 3, pages));

export async function runSync(onProgress: (p: SyncProgress) => void): Promise<SyncResult> {
  const result: SyncResult = { accounts: 0, transactions: 0, autoPaid: 0, pending: [], problems: [], failed: false };
  const emit = (phase: SyncProgress["phase"], banks: BankProgress[], message?: string) => {
    const perBank = banks.length ? banks.reduce((s, b) => s + b.progress, 0) / banks.length : 1;
    const overall = phase === "done" ? 1 : phase === "finalize" ? 0.92 + 0.06 * 0 : 0.02 + 0.9 * perBank;
    onProgress({ banks, overall, phase, message });
  };
  let banks: BankProgress[] = [];
  emit("listing", banks, "Finding your banks…");
  const list = await fetch("/api/plaid/sync").then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "could not list banks"); return j as { items: { id: string; itemId: string; institution: string }[]; needsHistory: boolean }; });
  banks = list.items.map((i) => ({ id: i.id, itemId: i.itemId, name: i.institution, state: "waiting", progress: 0, pages: 0, transactions: 0 }));
  emit("banks", banks, list.needsHistory ? "First full pull — this one takes a while, every page is saved as it lands." : undefined);
  const setBank = (id: string, patch: Partial<BankProgress>) => { banks = banks.map((b) => (b.id === id ? { ...b, ...patch } : b)); emit("banks", banks); };

  for (const bank of banks) {
    // 1) accounts + liabilities
    setBank(bank.id, { state: "accounts", progress: 0.05 });
    try {
      const a = await post({ itemId: bank.id, phase: "accounts" });
      if (!a.ok) { result.problems.push(a.problem as string); setBank(bank.id, { state: "failed", progress: 1, message: a.problem as string }); continue; }
      result.accounts += (a.accounts as number) ?? 0;
      setBank(bank.id, { state: "transactions", progress: 0.2 });
    } catch (e) { const m = `${bank.name}: ${(e as Error).message}`; result.problems.push(m); setBank(bank.id, { state: "failed", progress: 1, message: m }); continue; }
    // 2) transactions, chunk after chunk, until the bank says there's no more
    let hasMore = true, pages = 0, tx = 0, failed = false;
    while (hasMore) {
      try {
        const t = await post({ itemId: bank.id, phase: "transactions" });
        pages += (t.pages as number) ?? 0; tx += (t.transactions as number) ?? 0;
        hasMore = !!t.hasMore;
        if (t.pending) { result.pending.push(bank.name); setBank(bank.id, { state: "pending", progress: 1, pages, transactions: tx, message: "still loading at the bank — sync again in a minute" }); failed = true; break; }
        if (!t.ok) { result.problems.push(t.problem as string); setBank(bank.id, { state: "failed", progress: 1, pages, transactions: tx, message: t.problem as string }); failed = true; break; }
        setBank(bank.id, { progress: hasMore ? txProgress(pages) : 1, pages, transactions: tx });
      } catch (e) {
        // A single chunk that errors (timeout, blip) is retried once; the cursor was saved with the last good page.
        const m = `${bank.name}: ${(e as Error).message}`;
        if (!failed) { failed = true; await new Promise((r) => setTimeout(r, 1500)); continue; }
        result.problems.push(m); setBank(bank.id, { state: "failed", progress: 1, pages, transactions: tx, message: m }); break;
      }
      failed = false;
    }
    result.transactions += tx;
    if (banks.find((b) => b.id === bank.id)?.state === "transactions") setBank(bank.id, { state: "done", progress: 1 });
  }

  emit("finalize", banks, "Matching transfers, payments and bills…");
  try {
    const f = await post({ phase: "finalize" });
    result.autoPaid = (f.autoPaid as number) ?? 0;
  } catch (e) { result.problems.push(`finishing up: ${(e as Error).message}`); }
  result.failed = result.problems.length > 0;
  emit("done", banks);
  return result;
}
