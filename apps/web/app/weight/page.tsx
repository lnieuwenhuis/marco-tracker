import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { loadOnboardedDateParam } from "@/lib/page-context";

export const metadata: Metadata = {
  title: "Weight | Macro Tracker",
};

type WeightPageProps = {
  searchParams: Promise<{ date?: string }>;
};

export default async function WeightPage({ searchParams }: WeightPageProps) {
  const { selectedDate } = await loadOnboardedDateParam(searchParams);
  redirect(`/progress?date=${selectedDate}&tab=weight`);
}
