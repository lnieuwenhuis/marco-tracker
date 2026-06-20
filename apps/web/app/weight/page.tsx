import type { Metadata } from "next";
import { ensureDateString } from "@macro-tracker/db";
import { redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Weight | Macro Tracker",
};

type WeightPageProps = {
  searchParams: Promise<{ date?: string }>;
};

export default async function WeightPage({ searchParams }: WeightPageProps) {
  await requireSessionUser();
  const params = await searchParams;
  const selectedDate = ensureDateString(params.date);
  redirect(`/progress?date=${selectedDate}&tab=weight`);
}
