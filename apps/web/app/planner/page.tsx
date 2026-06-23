import { canAccessAdmin, ensureDateString, getDailySummary, getRecipes, getTemplates, getUserById } from "@macro-tracker/db";

import { PlannerShell } from "@/components/planner-shell";
import { requireOnboardedSessionUser } from "@/lib/auth";

type PlannerPageProps = {
  searchParams: Promise<{ date?: string }>;
};

export default async function PlannerPage({ searchParams }: PlannerPageProps) {
  const sessionUser = await requireOnboardedSessionUser();
  const params = await searchParams;
  const selectedDate = ensureDateString(params.date);
  const [templates, recipes, dailySummary, user] = await Promise.all([
    getTemplates(sessionUser.userId),
    getRecipes(sessionUser.userId),
    getDailySummary(sessionUser.userId, selectedDate),
    getUserById(sessionUser.userId),
  ]);

  return (
    <PlannerShell
      userEmail={user?.email ?? sessionUser.email}
      canAccessAdmin={user ? canAccessAdmin(user.role) : false}
      selectedDate={selectedDate}
      templates={templates}
      recipes={recipes}
      dailySummary={dailySummary}
    />
  );
}
