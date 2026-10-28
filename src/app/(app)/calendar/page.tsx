"use client";
import { Suspense } from "react";
import { CalendarView } from "@/components/CalendarView";
import { useToday } from "@/components/hooks";

function Inner() { const today = useToday(); return <CalendarView today={today} />; }
export default function CalendarPage() { return <Suspense><Inner /></Suspense>; }
