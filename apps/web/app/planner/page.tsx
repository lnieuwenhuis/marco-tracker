import { getDailySummary, getRecipeCount, getTemplates } from "@macro-tracker/db";

import { PlannerShell } from "@/components/planner-shell";
import { loadOnboardedPageContext } from "@/lib/page-context";

type PlannerPageProps = {
  searchParams: Promise<{ date?: string }>;
};

export default async function PlannerPage({ searchParams }: PlannerPageProps) {
  const { sessionUser, selectedDate, userEmail, canAccessAdmin } =
    await loadOnboardedPageContext(searchParams);
  const [templates, recipeCount, dailySummary] = await Promise.all([
    getTemplates(sessionUser.userId),
    getRecipeCount(sessionUser.userId),
    getDailySummary(sessionUser.userId, selectedDate),
  ]);

  return (
    <PlannerShell
      userEmail={userEmail}
      canAccessAdmin={canAccessAdmin}
      selectedDate={selectedDate}
      templates={templates}
      recipeCount={recipeCount}
      dailySummary={dailySummary}
    />
  );
}
