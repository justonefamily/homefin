"use client";
import { create } from "zustand";
import type { IncomeEvent } from "@/lib/types";

/** One app-wide "open the item page" door, so any line item anywhere can open it without wiring props. */
interface ItemState { merchant: string | null; deposit: IncomeEvent | null; openItem: (merchantKey: string) => void; openDeposit: (e: IncomeEvent) => void; close: () => void }
export const useItem = create<ItemState>((set) => ({
  merchant: null, deposit: null,
  openItem: (merchant) => set({ merchant, deposit: null }),
  openDeposit: (deposit) => set({ deposit, merchant: null }),
  close: () => set({ merchant: null, deposit: null }),
}));
