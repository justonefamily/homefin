import { describe, expect, it } from "vitest";
import { parseTransUnion } from "./parse";
import { diffReports } from "./diff";
import type { TextItem } from "./types";

/** Build positioned text from a column layout, the way pdf.js would hand it to us. Made-up data in the bureau's shape. */
function page(lines: string[]): TextItem[] {
  const items: TextItem[] = [];
  lines.forEach((line, row) => {
    const y = 800 - row * 10;
    let col = 0;
    for (const part of line.split("|")) {
      const lead = part.length - part.trimStart().length;
      const text = part.trim();
      if (text) items.push({ s: text, x: (col + lead) * 4, y, w: text.length * 4 });
      col += part.length + 1;
    }
  });
  return items;
}
// Columns at 0 / 50 / 95 (× 4 = x 0 / 200 / 380); the account number sits right of x=300 (col ≥ 80).
const REPORT = [
  "Date Created:",
  "01/15/2026",
  "Accounts with Adverse Information",
  "Account Name                                                                     | Account Number",
  "SAMPLE JEWELRY CARD                                                              | 123456****",
  "Address                                           | Phone                                       | Monthly Payment",
  "1 ANY ST SOMEWHERE, OH 00000                      | Phone number not available                  | - - -",
  "Date Opened                                       | Responsibility                              | Account Type",
  "08/12/2021                                        | Individual Account                          | Revolving Account",
  "Loan Type                                         | Balance                                     | Date Updated",
  "CHARGE ACCOUNT                                    | $0                                          | 07/09/2025",
  "Payment Received                                  | Last Payment Made                           | Pay Status",
  "$0                                                | 08/29/2024                                  | >Sold; was Charged-off<",
  "Terms                                             | Date Closed                                 | Estimated month and year this item will be removed",
  "Paid Monthly                                      | 05/31/2025                                  | 11/2031",
  "Payment History",
  "Aug 2024               | Sep 2024               | Oct 2024               | Nov 2024",
  "OK                     | 30                     | 60                     | C/O",
  "Satisfactory Accounts",
  "Account Name                                                                     | Account Number",
  "SAMPLE BANK CARD                                                                 | 987654****",
  "Date Opened                                       | Responsibility                              | Account Type",
  "06/15/2021                                        | Individual Account                          | Revolving Account",
  "Loan Type                                         | Balance                                     | Date Updated",
  "CREDIT CARD                                       | $1,400                                      | 01/02/2026",
  "Credit Limit                                      | Pay Status",
  "$2,800                                            | Current Account",
  "Regular Inquiries",
  "Name                                                                             | Requested On",
  "SAMPLE LENDER                                                                    | 03/01/2025, 04/02/2025",
  "Location                                          | Phone                                       | Inquiry Type",
  "PO BOX 1 ANYTOWN, TX 00000                        | (000) 000-0000                              | Individual",
  "Promotional Inquiries",
  "Name                                                                             | Requested On",
  "SOME OFFER CO                                                                    | 05/05/2025",
];

describe("TransUnion report parser", () => {
  const r = parseTransUnion([page(REPORT)], { person: "Sam", id: "r1", importedAt: "2026-01-20T00:00:00Z" });
  it("reads the header and both account sections", () => {
    expect(r.reportDate).toBe("01/15/2026");
    expect(r.accounts).toHaveLength(2);
    const [adv, ok] = r.accounts;
    expect(adv).toMatchObject({ creditor: "SAMPLE JEWELRY CARD", accountMask: "123456****", adverse: true, status: "closed", loanType: "CHARGE ACCOUNT", closed: "05/31/2025", payStatus: ">Sold; was Charged-off<", removalEstimate: "11/2031" });
    expect(adv.lates).toMatchObject({ d30: 1, d60: 1, chargeOff: 1 });
    expect(adv.history.map((h) => h.rating)).toEqual(["OK", "30", "60", "C/O"]);
    expect(ok).toMatchObject({ creditor: "SAMPLE BANK CARD", adverse: false, status: "open", balance: 1400, creditLimit: 2800 });
  });
  it("summarizes and reads inquiries", () => {
    expect(r.summary).toMatchObject({ open: 1, closed: 1, adverse: 1, utilization: 50, hardInquiries: 2 });
    expect(r.inquiries).toEqual([{ name: "SAMPLE LENDER", dates: ["03/01/2025", "04/02/2025"], kind: "regular" }, { name: "SOME OFFER CO", dates: ["05/05/2025"], kind: "promotional" }]);
  });
  it("diffs two imports", () => {
    const later = parseTransUnion([page(REPORT.map((l) => l.replace("$1,400", "$900").replace("03/01/2025, 04/02/2025", "03/01/2025, 04/02/2025, 12/12/2025")))], { person: "Sam", id: "r2", importedAt: "2026-02-20T00:00:00Z" });
    const d = diffReports(r, later);
    expect(d.balanceChanges).toHaveLength(1);
    expect(d.balanceChanges[0].delta).toBe(-500);
    expect(d.newInquiries).toEqual([{ name: "SAMPLE LENDER", date: "12/12/2025" }]);
    expect(d.newAccounts).toHaveLength(0);
  });
});
