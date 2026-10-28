"use client";
import { useState } from "react";
import { Info } from "lucide-react";
import { Button, Field, Modal, byName, inputCls, selectCls } from "./ui";
import { useItem } from "@/store/useItem";
import { merchantKey } from "@/lib/detect";
import type { Bill, HomeData } from "@/lib/types";
import { uid } from "@/lib/storage/adapter";

export function BillForm({ open, onClose, data, bill, onSave, onDelete, onNotABill }: { open: boolean; onClose: () => void; data: HomeData; bill?: Bill; onSave: (b: Bill) => void; onDelete?: (id: string) => void; onNotABill?: (b: Bill) => void }) {
  const [name, setName] = useState(bill?.name ?? "");
  const [amount, setAmount] = useState(bill?.amount ?? 0);
  const [dueDay, setDueDay] = useState(bill?.dueDay ?? 1);
  const [category, setCategory] = useState(bill?.category ?? data.budgets[0]?.id ?? "");
  const [accountId, setAccountId] = useState(bill?.accountId ?? "");
  const [autopay, setAutopay] = useState(bill?.autopay ?? false);
  const openItem = useItem((s) => s.openItem);
  return (
    <Modal open={open} onClose={onClose} title={bill ? "Edit bill" : "Add a bill"}>
      {bill && (
        <button type="button" onClick={() => { onClose(); openItem(bill.merchant ?? merchantKey(bill.name)); }} className="-mt-2 self-start inline-flex items-center gap-1.5 rounded-full border border-accent-line bg-accent-bg text-accent text-[11px] font-semibold px-2.5 py-1 hover:bg-accent-soft">
          <Info size={12} /> View item page — every transaction, what it&apos;s called, merges
        </button>
      )}
      <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Xfinity" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount ($)"><input className={inputCls} type="number" inputMode="decimal" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} /></Field>
        <Field label="Due day of month"><input className={inputCls} type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(Math.max(1, Math.min(31, Number(e.target.value))))} /></Field>
      </div>
      <Field label="Budget category">
        <select className={selectCls} value={category} onChange={(e) => setCategory(e.target.value)}>
          {[...data.budgets].sort(byName).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          {data.budgets.length === 0 && <option value="">(add categories under Plan → Budget)</option>}
        </select>
      </Field>
      <Field label="Linked account (optional)">
        <select className={selectCls} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">None</option>
          {[...data.accounts].sort(byName).map((a) => <option key={a.id} value={a.id}>{a.institution} · {a.name}</option>)}
        </select>
      </Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={autopay} onChange={(e) => setAutopay(e.target.checked)} className="w-4 h-4 accent-[#0e6b74]" /> Autopay is on</label>
      {bill?.merchant && <div className="text-[11px] text-muted">This bill was confirmed from your transactions. If that was a mistake, <b>Not a bill</b> removes it and stops suggesting it.</div>}
      <div className="flex gap-2 pt-1 flex-wrap">
        {bill && onDelete && <Button variant="danger" onClick={() => { onDelete(bill.id); onClose(); }}>Delete</Button>}
        {bill && onNotABill && <Button variant="secondary" onClick={() => { onNotABill(bill); onClose(); }}>Not a bill</Button>}
        <Button className="flex-1" disabled={!name || amount <= 0} onClick={() => { onSave({ id: bill?.id ?? uid(), name, amount, dueDay, category, accountId: accountId || undefined, autopay, cadence: "monthly", merchant: bill?.merchant }); onClose(); }}>Save</Button>
      </div>
    </Modal>
  );
}
