import { getUserGoals, getWeightPageData } from "@macro-tracker/db";

import { ProgressShell } from "@/components/progress-shell";
import { loadOnboardedPageContext } from "@/lib/page-context";
import { normalizeProgressTab } from "@/lib/ui-mode";

type ProgressPageProps = {
  searchParams: Promise<{
    date?: string;
    tab?: string;
  }>;
};

export default async function ProgressPage({ searchParams }: ProgressPageProps) {
  const { params, sessionUser, selectedDate, userEmail, canAccessAdmin } =
    await loadOnboardedPageContext(searchParams);
  const initialTab = normalizeProgressTab(params.tab);

  const [goals, weightData] = await Promise.all([
    getUserGoals(sessionUser.userId),
    getWeightPageData(sessionUser.userId, selectedDate),
  ]);

  return (
    <ProgressShell
      userEmail={userEmail}
      canAccessAdmin={canAccessAdmin}
      selectedDate={selectedDate}
      goals={goals}
      weightData={weightData}
      initialTab={initialTab}
    />
  );
}
