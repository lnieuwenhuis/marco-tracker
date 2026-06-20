import { canAccessAdmin, ensureDateString, getUserById, getUserGoals, getWeightPageData } from "@macro-tracker/db";

import { ProgressShell } from "@/components/progress-shell";
import { requireSessionUser } from "@/lib/auth";
import { normalizeProgressTab } from "@/lib/ui-mode";

type ProgressPageProps = {
  searchParams: Promise<{
    date?: string;
    tab?: string;
  }>;
};

export default async function ProgressPage({ searchParams }: ProgressPageProps) {
  const sessionUser = await requireSessionUser();
  const params = await searchParams;
  const selectedDate = ensureDateString(params.date);
  const initialTab = normalizeProgressTab(params.tab);

  const [goals, weightData, user] = await Promise.all([
    getUserGoals(sessionUser.userId),
    getWeightPageData(sessionUser.userId, selectedDate),
    getUserById(sessionUser.userId),
  ]);

  return (
    <ProgressShell
      userEmail={user?.email ?? sessionUser.email}
      canAccessAdmin={user ? canAccessAdmin(user.role) : false}
      selectedDate={selectedDate}
      goals={goals}
      weightData={weightData}
      initialTab={initialTab}
    />
  );
}
