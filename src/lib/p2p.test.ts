import { describe, expect, it } from "vitest";
import { merchantKey, p2pLabel } from "./detect";

// Synthetic descriptions in the shapes banks actually produce (names made up).
describe("person-to-person payments", () => {
  it("keys by recipient, not by platform", () => {
    expect(merchantKey("MONEY TRANSFER AUTHORIZED ON 07/22 CASH APP*SUNRISE C Oaklan")).toBe("cash app to sunrise c");
    expect(merchantKey("MONEY TRANSFER AUTHORIZED ON 06/13 CASH APP*PAT M Oaklan")).toBe("cash app to pat m");
    expect(merchantKey("PMNT SENT 1008 CASH APP*JORDAN RIVER Oakland CA XXXXX0000X")).toBe("cash app to jordan river");
    expect(merchantKey("Cash App OUR HOME A 260804 T3YD00SKD6JVKSD JORDAN RIVER")).toBe("cash app to our home a");
    expect(merchantKey("Zelle payment to Sunrise ministries of Ft. Lauderdale Conf# abc")).toBe("zelle to sunrise ministries");
    expect(merchantKey("ZELLE TO SUNRISE CONNECT ON 10/15 REF # WXYZ")).toBe("zelle to sunrise connect");
    expect(merchantKey("ZELLE HARD POST - ZELLE DB JORDAN RIVER ZELLE DB JORDAN")).toBe("zelle to jordan river");
    expect(merchantKey("Publix Super Market 1234")).toBe("publix super market");
  });
  it("labels read like a person would say it", () => {
    expect(p2pLabel("MONEY TRANSFER AUTHORIZED ON 07/22 CASH APP*SUNRISE C Oaklan")).toBe("Cash App → Sunrise C");
    expect(p2pLabel("Zelle payment to Sam Lee Conf# 1")).toBe("Zelle → Sam Lee");
    expect(p2pLabel("Publix")).toBeNull();
  });
});
