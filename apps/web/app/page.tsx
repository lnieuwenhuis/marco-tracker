import { canAccessAdmin, ensureDateString, getDailySummary, getRecentQuickAddCandidates, getRecipes, getTemplates, getUserById, getUserGoals } from "@macro-tracker/db";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard-shell";
import { requireSessionUser } from "@/lib/auth";
import { normalizeComposeAction } from "@/lib/compose";

type HomePageProps = {
  searchParams: Promise<{
    date?: string;
    compose?: string;
  }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const sessionUser = await requireSessionUser();
  const params = await searchParams;
  const selectedDate = ensureDateString(params.date);
  const initialComposeAction = normalizeComposeAction(params.compose);

  const [dailySummary, goals, user, templates, recipes, recentCandidates] = await Promise.all([
    getDailySummary(sessionUser.userId, selectedDate),
    getUserGoals(sessionUser.userId),
    getUserById(sessionUser.userId),
    getTemplates(sessionUser.userId),
    getRecipes(sessionUser.userId),
    getRecentQuickAddCandidates(sessionUser.userId),
  ]);
  if (user && !user.onboardingCompletedAt) {
    redirect("/onboarding");
  }
  const dashboardKey = JSON.stringify({ selectedDate, dailySummary });

  return (
    <DashboardShell
      key={dashboardKey}
      userEmail={user?.email ?? sessionUser.email}
      canAccessAdmin={user ? canAccessAdmin(user.role) : false}
      selectedDate={selectedDate}
      dailySummary={dailySummary}
      goals={goals}
      templates={templates}
      recipes={recipes}
      recentCandidates={recentCandidates}
      initialComposeAction={initialComposeAction}
    />
  );
}
