import {
  canAccessAdmin,
  ensureDateString,
  getPeriodAverages,
  getStatsPageData,
  getUserById,
  getUserGoals,
} from "@macro-tracker/db";

import { SummaryShell } from "@/components/summary-shell";
import { requireOnboardedSessionUser } from "@/lib/auth";

type SummaryPageProps = {
  searchParams: Promise<{
    date?: string;
  }>;
};

export default async function SummaryPage({ searchParams }: SummaryPageProps) {
  const sessionUser = await requireOnboardedSessionUser();
  const params = await searchParams;
  const selectedDate = ensureDateString(params.date);

  const [periodAverages, goals, user, statsData] = await Promise.all([
    getPeriodAverages(sessionUser.userId, selectedDate),
    getUserGoals(sessionUser.userId),
    getUserById(sessionUser.userId),
    getStatsPageData(sessionUser.userId, selectedDate),
  ]);

  return (
    <SummaryShell
      userEmail={user?.email ?? sessionUser.email}
      canAccessAdmin={user ? canAccessAdmin(user.role) : false}
      selectedDate={selectedDate}
      periodAverages={periodAverages}
      goals={goals}
      statsData={statsData}
    />
  );
}
