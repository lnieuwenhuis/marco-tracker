import { canAccessAdmin, ensureDateString, getDailySummary, getRecentQuickAddCandidates, getRecipes, getTemplates, getUserById, getUserGoals } from "@macro-tracker/db";

import { DashboardShell } from "@/components/dashboard-shell";
import { requireOnboardedSessionUser } from "@/lib/auth";
import { normalizeComposeAction } from "@/lib/compose";
import { normalizePresetTemplateKind } from "@/lib/preset-modal-state";

type HomePageProps = {
  searchParams: Promise<{
    date?: string;
    compose?: string;
    templateKind?: string;
  }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const sessionUser = await requireOnboardedSessionUser();
  const params = await searchParams;
  const selectedDate = ensureDateString(params.date);
  const initialComposeAction = normalizeComposeAction(params.compose);
  const initialPresetTemplateKind = normalizePresetTemplateKind(params.templateKind);

  const [dailySummary, goals, user, templates, recipes, recentCandidates] = await Promise.all([
    getDailySummary(sessionUser.userId, selectedDate),
    getUserGoals(sessionUser.userId),
    getUserById(sessionUser.userId),
    getTemplates(sessionUser.userId),
    getRecipes(sessionUser.userId),
    getRecentQuickAddCandidates(sessionUser.userId),
  ]);
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
      initialPresetTemplateKind={initialPresetTemplateKind}
    />
  );
}
