import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { loadOnboardedDateParam } from "@/lib/page-context";

export const metadata: Metadata = {
  title: "Stats | Macro Tracker",
};

type StatsPageProps = {
  searchParams: Promise<{ date?: string }>;
};

export default async function StatsPage({ searchParams }: StatsPageProps) {
  const { selectedDate } = await loadOnboardedDateParam(searchParams);
  redirect(`/summary?date=${selectedDate}`);
}
