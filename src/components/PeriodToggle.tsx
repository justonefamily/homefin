"use client";
import { Segmented } from "./ui";
import type { PeriodRange } from "@/lib/projections";

/** Pick between the two pay periods of a month, labeled with their real dates (which may run into next month). */
export const PeriodToggle = ({ value, onChange, ranges, size }: { value: PeriodRange; onChange: (p: PeriodRange) => void; ranges: PeriodRange[]; size?: "sm" | "md" }) => (
  <Segmented value={value.period + value.anchor.getTime()} onChange={(id) => { const r = ranges.find((x) => x.period + x.anchor.getTime() === id); if (r) onChange(r); }} size={size} options={ranges.map((r) => ({ id: r.period + r.anchor.getTime(), label: r.label }))} />
);
