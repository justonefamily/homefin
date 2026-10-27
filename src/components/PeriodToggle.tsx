"use client";
import { Segmented } from "./ui";
import type { Period } from "@/lib/projections";

export const PeriodToggle = ({ value, onChange, splitDay, daysInMonth, size }: { value: Period; onChange: (p: Period) => void; splitDay: number; daysInMonth: number; size?: "sm" | "md" }) => (
  <Segmented value={value} onChange={onChange} size={size} options={[{ id: "a", label: `1st – ${splitDay}th` }, { id: "b", label: `${splitDay + 1}th – ${daysInMonth === 31 ? "31st" : daysInMonth === 30 ? "30th" : "end"}` }]} />
);
