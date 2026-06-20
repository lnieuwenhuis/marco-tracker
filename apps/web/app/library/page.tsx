import { canAccessAdmin, ensureDateString, getRecipes, getTemplates, getUserById, searchFoodProducts } from "@macro-tracker/db";

import { LibraryShell } from "@/components/library-shell";
import { requireSessionUser } from "@/lib/auth";

type LibraryPageProps = {
  searchParams: Promise<{ q?: string; date?: string }>;
};

export default async function LibraryPage({ searchParams }: LibraryPageProps) {
  const sessionUser = await requireSessionUser();
  const params = await searchParams;
  const query = params.q ?? "";
  const selectedDate = ensureDateString(params.date);
  const [templates, recipes, products, user] = await Promise.all([
    getTemplates(sessionUser.userId),
    getRecipes(sessionUser.userId),
    query.trim() ? searchFoodProducts(sessionUser.userId, query) : Promise.resolve([]),
    getUserById(sessionUser.userId),
  ]);

  return (
    <LibraryShell
      userEmail={user?.email ?? sessionUser.email}
      canAccessAdmin={user ? canAccessAdmin(user.role) : false}
      selectedDate={selectedDate}
      query={query}
      products={products}
      templates={templates}
      recipes={recipes}
    />
  );
}
