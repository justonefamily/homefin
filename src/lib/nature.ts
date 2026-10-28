/**
 * The internal parser: reads a bank description the way a person would and says what kind of thing it is —
 * a wire, an ACH payment, a fee, interest, an ATM withdrawal, a move between accounts, a card purchase —
 * and who the other party is. Keys, labels and default treatment all come from this, so new transactions
 * are understood by what they are rather than by their exact wording.
 */
export type Nature = "wire" | "ach" | "transfer" | "fee" | "interest" | "atm" | "check" | "card" | "p2p" | "other";

export interface Parsed { nature: Nature; party: string | null; label: string; /** default treatment when nothing has been decided */ defaultKind: "spend" | "transfer" }

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const words = (s: string, n = 3) => s.toLowerCase().replace(/[^a-z&' ]+/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).filter((w, i, a) => a.indexOf(w) === i).slice(0, n).join(" ");
const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/** Strip the boilerplate banks wrap around the real merchant: "PURCHASE AUTHORIZED ON 08/28 … CARD 3702", "CHECKCARD 0512 …", "POS Debit - Visa Check Card 9414 -". */
export function stripBoilerplate(desc: string): string {
  return squash(desc)
    .replace(/^(recurring\s+)?(purchase|payment|checkcard|pos\s+debit(\s*-\s*visa\s+check\s+card\s+\d+\s*-)?|debit\s+card\s+purchase|money\s+transfer|pmnt\s+sent)\s*/i, "")
    .replace(/^(authorized|auth)\s+on\s+\d{2}\/\d{2}\s*/i, "")
    .replace(/^\d{4}\s+/, "")
    .replace(/\s+(card|xxxx\w*)\s*\d{3,}.*$/i, "")
    .replace(/\s+[sp]\d{12,}.*$/i, "")
    .replace(/\s+(ref|conf|trn|id)\s*#?\s*:?\s*\w+.*$/i, "")
    .trim();
}

export function parseNature(desc: string): Parsed {
  const d = squash(desc);
  let m: RegExpMatchArray | null;
  if ((m = d.match(/WIRE TYPE:\s*WIRE (OUT|IN)/i))) {
    const bnf = d.match(/\bBNF:\s*([^:]+?)\s+(ID|BNF BK|PMT|$)/i)?.[1] ?? d.match(/\bORIG:\s*([^:]+?)\s+(ID|$)/i)?.[1] ?? null;
    const party = bnf ? words(bnf) : null;
    return { nature: "wire", party, label: `Wire ${m[1].toLowerCase()}${party ? ` → ${cap(party)}` : ""}`, defaultKind: "spend" };
  }
  if (/overdraft protection xfer|\bxfer to (checking|savings)\b|online transfer (to|from)\b.*(checking|savings|xxxx)|transfer to .*(xxxx\d+|checking|savings)/i.test(d)) {
    const to = d.match(/transfer (?:to|from)\s+(.+?)\s+(ref|xxxx|on\b)/i)?.[1];
    return { nature: "transfer", party: to ? words(to) : null, label: `Transfer${to ? ` → ${cap(words(to))}` : " between accounts"}`, defaultKind: "transfer" };
  }
  if (/\b(interest charge|finance charge|interest)\b/i.test(d) && !/\bcoffee\b/i.test(d)) return { nature: "interest", party: null, label: "Interest charge", defaultKind: "spend" };
  if (/\b(fee|fees|fee assessment|overdraft item fee|overdraft fee|past due fee|service charge|svc charge)\b/i.test(d)) return { nature: "fee", party: null, label: "Bank fee", defaultKind: "spend" };
  if (/\batm\b.*(withdrawal|cash)|cash withdrawal|\batm withdrawal/i.test(d)) return { nature: "atm", party: null, label: "ATM cash", defaultKind: "spend" };
  if (/\bcheck\s*#?\s*\d+|\bcheck (paid|withdrawal)/i.test(d)) return { nature: "check", party: null, label: "Check", defaultKind: "spend" };
  if ((m = d.match(/^(.+?)\s+ACH\s+(retry\s+)?(payment|pymt|debit|transaction)/i))) { const party = words(m[1]); return { nature: "ach", party, label: `ACH payment → ${cap(party)}`, defaultKind: "spend" }; }
  if ((m = d.match(/^ACH Transaction\s*-\s*(.+?)\s+(ACH|\d)/i))) { const party = words(m[1]); return { nature: "ach", party, label: `ACH payment → ${cap(party)}`, defaultKind: "spend" }; }
  if (/^(purchase|checkcard|pos debit|recurring payment)/i.test(d)) { const party = words(stripBoilerplate(d)); return { nature: "card", party, label: cap(party), defaultKind: "spend" }; }
  return { nature: "other", party: null, label: cap(words(stripBoilerplate(d))), defaultKind: "spend" };
}

export const NATURE_LABEL: Record<Nature, string> = { wire: "Wire", ach: "ACH payment", transfer: "Transfer between accounts", fee: "Bank fee", interest: "Interest charge", atm: "ATM cash", check: "Check", card: "Card purchase", p2p: "Person-to-person", other: "" };
