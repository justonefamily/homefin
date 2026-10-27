"use client";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

/** Today's date; `?date=YYYY-MM-DD` overrides it (handy for demos and screenshots). */
export function useToday(): Date {
  const params = useSearchParams();
  const override = params.get("date");
  return useMemo(() => {
    if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) { const [y, m, d] = override.split("-").map(Number); return new Date(y, m - 1, d); }
    return new Date();
  }, [override]);
}
