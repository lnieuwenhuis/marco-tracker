import { ensureDateString } from "@macro-tracker/db";
import { redirect } from "next/navigation";

import { requireOnboardedSessionUser } from "@/lib/auth";

type GoalsPageProps = {
  searchParams: Promise<{ date?: string }>;
};

export default async function GoalsPage({ searchParams }: GoalsPageProps) {
  await requireOnboardedSessionUser();
  const params = await searchParams;
  const selectedDate = ensureDateString(params.date);
  redirect(`/progress?date=${selectedDate}&tab=goals`);
}
