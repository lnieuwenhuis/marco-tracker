import { redirect } from "next/navigation";

import { loadOnboardedDateParam } from "@/lib/page-context";

type GoalsPageProps = {
  searchParams: Promise<{ date?: string }>;
};

export default async function GoalsPage({ searchParams }: GoalsPageProps) {
  const { selectedDate } = await loadOnboardedDateParam(searchParams);
  redirect(`/progress?date=${selectedDate}&tab=goals`);
}
