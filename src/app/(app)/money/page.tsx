"use client";
import { MoneyView } from "@/components/MoneyView";
import { useToday } from "@/components/hooks";

export default function MoneyPage() {
  const today = useToday();
  return <MoneyView today={today} />;
}
