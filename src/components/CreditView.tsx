"use client";
import { useState } from "react";
import { AlertTriangle, ChevronRight, FileUp, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { useHome } from "@/store/useHome";
import { Button, Card, Field, Modal, cx, inputCls, money, selectCls } from "./ui";
import { parseTransUnion } from "@/lib/credit/parse";
import { diffReports } from "@/lib/credit/diff";
import type { CreditAccount, CreditReport } from "@/lib/credit/types";
import { uid } from "@/lib/storage/adapter";

const fmtDate = (s?: string) => s ?? "—";
const RATING_CLS: Record<string, string> = { OK: "bg-green/80", "30": "bg-amber", "60": "bg-amber", "90": "bg-red/80", "120": "bg-red", "C/O": "bg-ink", COL: "bg-ink", X: "bg-chip", "N/R": "bg-line", "": "bg-line-soft" };

/** Credit reports, imported from the bureau PDFs: open/closed accounts, derogatory marks, inquiries, and what changed since last time. */
export function CreditView() {
  const { data: d, update } = useHome();
  const data = d!;
  const reports = (data.credit?.reports ?? []).slice().sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  const people = [...new Set(reports.map((r) => r.person))];
  const [person, setPerson] = useState<string>(people[0] ?? "");
  const [importing, setImporting] = useState(false);
  const [open, setOpen] = useState<CreditAccount | null>(null);
  const [showImport, setShowImport] = useState(reports.length === 0);
  const mine = reports.filter((r) => r.person === person);
  const latest: CreditReport | undefined = mine[0];
  const previous: CreditReport | undefined = mine[1];
  const diff = latest && previous ? diffReports(previous, latest) : null;
  const remove = (id: string) => update((h) => ({ ...h, credit: { reports: (h.credit?.reports ?? []).filter((r) => r.id !== id) } }), "removed a credit report");

  return (
    <>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[13px] text-muted leading-snug max-w-xl">Your credit report, read straight from the bureau&apos;s PDF — parsed on this device; only the accounts, marks and inquiries are saved (never your SSN or addresses). Re-import any time to track what changed.</div>
        <div className="flex gap-2">
          {people.length > 1 && <select className={cx(selectCls, "h-10 w-40")} value={person} onChange={(e) => setPerson(e.target.value)}>{people.map((p) => <option key={p}>{p}</option>)}</select>}
          <Button onClick={() => setShowImport(true)} className="h-10"><FileUp size={14} className="inline -mt-0.5 mr-1" />Import report</Button>
        </div>
      </div>

      {!latest && <Card className="p-6 text-center text-sm text-muted flex flex-col items-center gap-2"><ShieldCheck size={20} className="text-muted-3" />No report yet. Get a free one at annualcreditreport.com (TransUnion is supported today) and import the PDF.</Card>}

      {latest && (
        <>
          <div className="flex items-center justify-between text-[12px] text-muted flex-wrap gap-2">
            <span><b className="text-ink">{latest.person}</b> · {latest.bureau} · report dated {latest.reportDate || "—"} · imported {new Date(latest.importedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}{previous ? ` · compared with ${previous.reportDate || new Date(previous.importedAt).toLocaleDateString()}` : ""}</span>
            <button onClick={() => confirm("Remove this import?") && remove(latest.id)} className="text-muted hover:text-red inline-flex items-center gap-1"><Trash2 size={12} />Remove</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2.5">
            <Kpi label="Open accounts" value={String(latest.summary.open)} />
            <Kpi label="Closed" value={String(latest.summary.closed)} />
            <Kpi label="Adverse" value={String(latest.summary.adverse)} tone={latest.summary.adverse ? "red" : "green"} />
            <Kpi label="Collections" value={String(latest.summary.collections)} tone={latest.summary.collections ? "red" : undefined} />
            <Kpi label="Card utilization" value={latest.summary.utilization === null ? "—" : `${latest.summary.utilization}%`} tone={latest.summary.utilization !== null && latest.summary.utilization > 30 ? "amber" : undefined} sub={latest.summary.totalLimit ? `of ${money(latest.summary.totalLimit)} limit` : undefined} />
            <Kpi label="Hard inquiries" value={String(latest.summary.hardInquiries)} sub="last 2 years" />
          </div>

          {diff && <Section title="What changed since last import" defaultOpen>
            {diff.newAccounts.length + diff.closed.length + diff.gone.length + diff.newAdverse.length + diff.clearedAdverse.length + diff.newInquiries.length + diff.balanceChanges.length === 0 && <div className="px-4 py-3 text-[12px] text-muted">Nothing changed.</div>}
            {diff.newAdverse.map((a) => <Line key={"na" + a.id} tone="red" title={`New adverse mark · ${a.creditor}`} sub={a.payStatus} onClick={() => setOpen(a)} />)}
            {diff.clearedAdverse.map((a) => <Line key={"ca" + a.id} tone="green" title={`No longer adverse · ${a.creditor}`} sub={a.payStatus} onClick={() => setOpen(a)} />)}
            {diff.newAccounts.map((a) => <Line key={"n" + a.id} title={`New on report · ${a.creditor}`} sub={`${a.accountType ?? ""} · opened ${fmtDate(a.opened)}`} onClick={() => setOpen(a)} />)}
            {diff.closed.map((a) => <Line key={"c" + a.id} title={`Closed · ${a.creditor}`} sub={a.payStatus} onClick={() => setOpen(a)} />)}
            {diff.gone.map((a) => <Line key={"g" + a.id} title={`Dropped off · ${a.creditor}`} sub="no longer on the report" />)}
            {diff.newInquiries.map((q, i) => <Line key={"q" + i} title={`New hard inquiry · ${q.name}`} sub={q.date} />)}
            {diff.balanceChanges.map((c) => <Line key={"b" + c.after.id} title={c.after.creditor} sub={`balance ${money(c.before.balance ?? 0)} → ${money(c.after.balance ?? 0)}`} right={`${c.delta > 0 ? "+" : "−"}${money(Math.abs(c.delta))}`} tone={c.delta > 0 ? "red" : "green"} onClick={() => setOpen(c.after)} />)}
            {diff.utilization.before !== diff.utilization.after && <div className="px-4 py-2 text-[12px] text-muted">Card utilization {diff.utilization.before ?? "—"}% → {diff.utilization.after ?? "—"}%</div>}
          </Section>}

          <Section title="Needs attention" count={latest.accounts.filter((a) => a.adverse).length} defaultOpen tone="red">
            {latest.accounts.filter((a) => a.adverse).length === 0 && <div className="px-4 py-3 text-[12px] text-muted">No adverse accounts. 🎉</div>}
            {latest.accounts.filter((a) => a.adverse).map((a) => <AccountRow key={a.id} a={a} onClick={() => setOpen(a)} />)}
          </Section>
          <Section title="Open accounts" count={latest.accounts.filter((a) => a.status === "open" && !a.adverse).length} defaultOpen>
            {latest.accounts.filter((a) => a.status === "open" && !a.adverse).map((a) => <AccountRow key={a.id} a={a} onClick={() => setOpen(a)} />)}
          </Section>
          <Section title="Closed accounts" count={latest.accounts.filter((a) => a.status === "closed" && !a.adverse).length}>
            {latest.accounts.filter((a) => a.status === "closed" && !a.adverse).map((a) => <AccountRow key={a.id} a={a} onClick={() => setOpen(a)} />)}
          </Section>
          <Section title="Hard inquiries" count={latest.summary.hardInquiries}>
            {latest.inquiries.filter((q) => q.kind === "regular").map((q, i) => <Line key={i} title={q.name} sub={q.dates.join(", ")} />)}
            {latest.inquiries.filter((q) => q.kind !== "regular").length > 0 && <div className="px-4 py-2 text-[11px] text-muted">Plus {latest.inquiries.filter((q) => q.kind === "promotional").length} promotional and {latest.inquiries.filter((q) => q.kind === "review").length} account-review inquiries — those don&apos;t affect your score.</div>}
          </Section>
          {latest.publicRecords.length > 0 && <Section title="Public records" count={latest.publicRecords.length} tone="red" defaultOpen>{latest.publicRecords.map((p, i) => <div key={i} className="px-4 py-2 text-[12px]">{p}</div>)}</Section>}
          {mine.length > 1 && <div className="text-[11px] text-muted">{mine.length} imports kept for {person}: {mine.map((r) => r.reportDate || new Date(r.importedAt).toLocaleDateString()).join(" · ")}</div>}
        </>
      )}

      {open && <AccountDetail a={open} onClose={() => setOpen(null)} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} defaultPerson={person} people={people} busy={importing} onImport={async (file, who) => {
        setImporting(true);
        try {
          const { pdfToItems, detectBureau } = await import("@/lib/credit/pdf");
          const pages = await pdfToItems(file);
          const bureau = detectBureau(pages);
          if (bureau !== "TransUnion") throw new Error(bureau ? `${bureau} reports aren't supported yet — TransUnion only for now.` : "That doesn't look like a credit report PDF.");
          const report = parseTransUnion(pages, { person: who, id: uid(), importedAt: new Date().toISOString() });
          if (!report.accounts.length) throw new Error("Couldn't find any accounts in that file.");
          update((h) => ({ ...h, credit: { reports: [...(h.credit?.reports ?? []), report] } }), `imported ${report.bureau} credit report for ${who}`);
          setPerson(who); setShowImport(false);
        } catch (e) { alert((e as Error).message); }
        setImporting(false);
      }} />}
    </>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "red" | "green" | "amber" }) {
  return <Card className="p-3"><div className="text-[11px] text-muted">{label}</div><div className={cx("text-[17px] font-bold", tone === "red" && "text-red", tone === "green" && "text-green", tone === "amber" && "text-amber")}>{value}</div>{sub && <div className="text-[11px] text-muted">{sub}</div>}</Card>;
}
function Section({ title, count, children, defaultOpen, tone }: { title: string; count?: number; children: React.ReactNode; defaultOpen?: boolean; tone?: "red" }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="flex flex-col gap-2">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-1.5 text-left py-1 text-sm font-semibold"><ChevronRight size={15} className={cx("text-muted transition-transform", open && "rotate-90")} />{tone === "red" && <AlertTriangle size={14} className="text-red" />}{title}{count !== undefined && <span className="text-[11px] font-normal text-muted">· {count}</span>}</button>
      {open && <Card>{children}</Card>}
    </div>
  );
}
function Line({ title, sub, right, tone, onClick }: { title: string; sub?: string; right?: string; tone?: "red" | "green"; onClick?: () => void }) {
  const inner = <><div className="flex-1 min-w-0"><div className="text-[13px] font-semibold truncate">{title}</div>{sub && <div className="text-[11px] text-muted truncate">{sub}</div>}</div>{right && <div className={cx("text-[13px] font-semibold", tone === "red" && "text-red", tone === "green" && "text-green")}>{right}</div>}</>;
  const cls = cx("w-full flex items-center gap-3 px-4 py-2.5 border-b border-line-soft last:border-b-0 text-left", tone === "red" && "bg-red/5", tone === "green" && "bg-green/5");
  return onClick ? <button onClick={onClick} className={cx(cls, "hover:bg-surface/60")}>{inner}</button> : <div className={cls}>{inner}</div>;
}
function AccountRow({ a, onClick }: { a: CreditAccount; onClick: () => void }) {
  const marks = a.lates.d30 + a.lates.d60 + a.lates.d90 + a.lates.d120;
  return (
    <button onClick={onClick} className="w-full text-left flex items-center gap-3 px-4 py-2.5 border-b border-line-soft last:border-b-0 hover:bg-surface/60">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold truncate">{a.creditor} <span className="text-muted font-normal">{a.accountMask.slice(-6)}</span></div>
        <div className="text-[11px] text-muted truncate">{[a.loanType ?? a.accountType, a.opened ? `opened ${a.opened}` : null, a.closed ? `closed ${a.closed}` : null, a.payStatus].filter(Boolean).join(" · ")}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[13px] font-semibold">{a.balance !== undefined ? money(a.balance) : "—"}</div>
        <div className="text-[11px] text-muted">{a.creditLimit ? `of ${money(a.creditLimit)}` : a.highBalance ? `high ${money(a.highBalance)}` : ""}{marks ? ` · ${marks} late` : ""}{a.lates.chargeOff ? " · charge-off" : ""}</div>
      </div>
    </button>
  );
}
function AccountDetail({ a, onClose }: { a: CreditAccount; onClose: () => void }) {
  const hist = a.history.slice().sort((x, y) => x.month.localeCompare(y.month));
  return (
    <Modal open onClose={onClose} title={a.creditor}>
      <div className={cx("rounded-[12px] px-3 py-2 text-[12px] font-semibold -mt-1", a.adverse ? "bg-red/10 text-red" : a.status === "open" ? "bg-green/10 text-green" : "bg-surface text-muted")}>{a.payStatus ?? (a.status === "open" ? "Open" : "Closed")}{a.removalEstimate ? ` · expected to drop off ${a.removalEstimate}` : ""}</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2 text-[12px]">
        {Object.entries(a.fields).filter(([k, v]) => v && !/^(Address|Phone)$/.test(k)).map(([k, v]) => <div key={k} className="min-w-0"><div className="text-[10px] font-semibold text-muted">{k}</div><div className="font-medium break-words">{v}</div></div>)}
      </div>
      {hist.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold text-muted mb-1">Payment history · {hist.length} months</div>
          <div className="grid gap-0.5" style={{ gridTemplateColumns: "repeat(12, minmax(0, 1fr))" }}>
            {hist.map((h) => <div key={h.month} title={`${h.month}: ${h.rating || "—"}${h.balance !== undefined ? ` · bal ${money(h.balance)}` : ""}`} className={cx("h-4 rounded-[3px]", RATING_CLS[h.rating] ?? "bg-chip")} />)}
          </div>
          <div className="flex gap-3 text-[10px] text-muted mt-1 flex-wrap"><span><i className="inline-block w-2.5 h-2.5 rounded-[2px] bg-green/80 align-middle mr-1" />on time</span><span><i className="inline-block w-2.5 h-2.5 rounded-[2px] bg-amber align-middle mr-1" />30–60 late</span><span><i className="inline-block w-2.5 h-2.5 rounded-[2px] bg-red align-middle mr-1" />90+ late</span><span><i className="inline-block w-2.5 h-2.5 rounded-[2px] bg-ink align-middle mr-1" />charge-off / collection</span><span>oldest → newest</span></div>
        </div>
      )}
    </Modal>
  );
}
function ImportModal({ onClose, onImport, defaultPerson, people, busy }: { onClose: () => void; onImport: (f: File, who: string) => void; defaultPerson: string; people: string[]; busy: boolean }) {
  const [who, setWho] = useState(defaultPerson);
  const [file, setFile] = useState<File | null>(null);
  return (
    <Modal open onClose={onClose} title="Import a credit report">
      <div className="text-[12px] text-muted leading-relaxed">Download your full report as a PDF from <b>annualcreditreport.com</b> (free, all three bureaus) or the TransUnion app. It&apos;s read right here in your browser and never uploaded; only the parsed accounts, marks and inquiries are kept with your home.</div>
      <Field label="Whose report"><input className={inputCls} list="credit-people" value={who} onChange={(e) => setWho(e.target.value)} placeholder="Abraham" /><datalist id="credit-people">{people.map((p) => <option key={p} value={p} />)}</datalist></Field>
      <Field label="Report PDF (TransUnion)"><input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-[13px]" /></Field>
      <Button disabled={!file || !who.trim() || busy} onClick={() => file && onImport(file, who.trim())}>{busy ? <><Loader2 size={14} className="inline animate-spin mr-1.5" />Reading…</> : "Import"}</Button>
    </Modal>
  );
}
