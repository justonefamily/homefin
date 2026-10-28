import { describe, expect, it } from "vitest";
import { parseNature, stripBoilerplate } from "./nature";
import { merchantKey } from "./detect";
import { emptyHome } from "./types";
import { classify, billKeyMap, migrateMerchantKeys, moveTransaction, txKey } from "./merchants";

describe("the parser", () => {
  it("reads wires by beneficiary", () => {
    const d = "WIRE TYPE:WIRE OUT DATE:251002 TIME:1501 ET TRN:XXXXXXXXXX489932 SERVICE REF:016438 BNF:SUNRISE VALUE PROPERTIES ID:XXXXX1958 BNF BK:SOME BANK, NA ID:XXXXX4131 PMT DET:V8LQG7XZ S";
    expect(parseNature(d)).toMatchObject({ nature: "wire", party: "sunrise value properties", label: "Wire out → Sunrise Value Properties" });
    expect(merchantKey(d)).toBe("wire to sunrise value properties");
    expect(merchantKey("Wire Transfer Fee")).not.toBe(merchantKey(d));
  });
  it("reads fees, interest, atm, ach, transfers", () => {
    expect(parseNature("Wire Transfer Fee").nature).toBe("fee");
    expect(parseNature("INTEREST CHARGE-PURCHASES").nature).toBe("interest");
    expect(parseNature("NON-WF ATM WITHDRAWAL AUTHORIZED ON 09/08 622 E BROAD STREET").nature).toBe("atm");
    expect(parseNature("NFCU ACH PAYMENT 260120 295394253000002 SOMEONE")).toMatchObject({ nature: "ach", party: "nfcu" });
    expect(parseNature("OVERDRAFT PROTECTION XFER TO CHECKING")).toMatchObject({ nature: "transfer", defaultKind: "transfer" });
    expect(parseNature("ONLINE TRANSFER TO SMITH A EVERYDAY CHECKING XXXXXX0850 REF #IB0RR4Q2FD ON 03/23/25").defaultKind).toBe("transfer");
    expect(parseNature("Capybara Coffee").nature).toBe("other");
  });
  it("strips card boilerplate so the merchant is the key", () => {
    expect(stripBoilerplate("PURCHASE AUTHORIZED ON 08/28 DP SERVICE FEE UTI ID S386240616190711 CARD 3702")).toBe("DP SERVICE FEE UTI ID");
    expect(merchantKey("PURCHASE AUTHORIZED ON 08/28 CLCKPAY HOA DUES S386240616190711 CARD 3702")).toBe("clckpay hoa dues");
    expect(merchantKey("CHECKCARD 0512 UBR* PENDING.U")).toBe("ubr pending u");
  });
  it("transfers between own accounts default to transfer; one transaction can be moved out", () => {
    const h = emptyHome();
    h.transactions = [
      { id: "a", date: "2026-10-01", description: "OVERDRAFT PROTECTION XFER TO CHECKING", amount: 200, category: "other" },
      { id: "b", date: "2026-10-02", description: "Wire Transfer Fee", amount: 15, category: "other" },
    ];
    expect(classify(h, h.transactions[0], billKeyMap(h)).kind).toBe("transfer");
    const moved = moveTransaction(h, "b", "tx:b");
    expect(txKey(moved, moved.transactions[1])).toBe("tx:b");
    const back = moveTransaction(moved, "b", undefined);
    expect(txKey(back, back.transactions[1])).toBe(merchantKey("Wire Transfer Fee"));
  });
  it("carries old decisions to new keys", () => {
    const h = emptyHome();
    h.transactions = [{ id: "a", date: "2026-10-01", description: "PURCHASE AUTHORIZED ON 08/28 CLCKPAY HOA DUES S386240616190711 CARD 3702", amount: 71, category: "other" }];
    h.settings.merchants = { "authorized on clckpay": { name: "HOA" } };
    const next = migrateMerchantKeys(h)!;
    expect(next.settings.merchants!["clckpay hoa dues"]?.name).toBe("HOA");
    expect(next.settings.merchants!["authorized on clckpay"]).toBeUndefined();
    expect(migrateMerchantKeys(next)).toBeNull();
  });
});
