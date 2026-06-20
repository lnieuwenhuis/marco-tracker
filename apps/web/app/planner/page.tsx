import { canAccessAdmin, ensureDateString, getDailySummary, getTemplates, getUserById } from "@macro-tracker/db";

import { PlannerShell } from "@/components/planner-shell";
import { requireSessionUser } from "@/lib/auth";

type PlannerPageProps = {
  searchParams: Promise<{ date?: string }>;
};

export default async function PlannerPage({ searchParams }: PlannerPageProps) {
  const sessionUser = await requireSessionUser();
  const params = await searchParams;
  const selectedDate = ensureDateString(params.date);
  const [templates, dailySummary, user] = await Promise.all([
    getTemplates(sessionUser.userId),
    getDailySummary(sessionUser.userId, selectedDate),
    getUserById(sessionUser.userId),
  ]);

  return (
    <PlannerShell
      userEmail={user?.email ?? sessionUser.email}
      canAccessAdmin={user ? canAccessAdmin(user.role) : false}
      selectedDate={selectedDate}
      templates={templates}
      dailySummary={dailySummary}
    />
  );
}
