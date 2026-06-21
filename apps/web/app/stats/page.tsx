import type { Metadata } from "next";
import { ensureDateString } from "@macro-tracker/db";
import { redirect } from "next/navigation";

import { requireOnboardedSessionUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Stats | Macro Tracker",
};

type StatsPageProps = {
  searchParams: Promise<{ date?: string }>;
};

export default async function StatsPage({ searchParams }: StatsPageProps) {
  await requireOnboardedSessionUser();
  const params = await searchParams;
  const selectedDate = ensureDateString(params.date);
  redirect(`/summary?date=${selectedDate}`);
}
