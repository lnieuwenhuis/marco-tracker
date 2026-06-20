import { canAccessAdmin, ensureDateString, getRecipeById, getTemplates, getUserById } from "@macro-tracker/db";
import { notFound } from "next/navigation";

import { RecipeBuilderShell } from "@/components/recipe-builder-shell";
import { requireSessionUser } from "@/lib/auth";

type EditRecipePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    date?: string;
  }>;
};

export default async function EditRecipePage({
  params,
  searchParams,
}: EditRecipePageProps) {
  const sessionUser = await requireSessionUser();
  const [routeParams, queryParams] = await Promise.all([params, searchParams]);
  const selectedDate = ensureDateString(queryParams.date);

  const [recipe, templates, user] = await Promise.all([
    getRecipeById(sessionUser.userId, routeParams.id),
    getTemplates(sessionUser.userId),
    getUserById(sessionUser.userId),
  ]);

  if (!recipe) {
    notFound();
  }

  return (
    <RecipeBuilderShell
      key={recipe.id}
      userEmail={user?.email ?? sessionUser.email}
      canAccessAdmin={user ? canAccessAdmin(user.role) : false}
      selectedDate={selectedDate}
      templates={templates}
      mode="edit"
      recipe={recipe}
    />
  );
}
