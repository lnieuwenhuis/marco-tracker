import type { MealEntryInput, MealEntryStatus, RecipeRecord } from "@macro-tracker/db";

export type RecipePortionMealEntryInput = Omit<MealEntryInput, "sortOrder"> & {
  sortOrder?: number;
};

export function buildRecipePortionMealEntryInput({
  date,
  gramsConsumed,
  portionCount,
  recipe,
  status,
  today,
}: {
  date: string;
  gramsConsumed: number | null;
  portionCount: number;
  recipe: RecipeRecord;
  status?: MealEntryStatus;
  today: string;
}): RecipePortionMealEntryInput {
  if (
    gramsConsumed != null &&
    (recipe.totalCookedWeightG == null || recipe.totalCookedWeightG <= 0)
  ) {
    throw new Error("Recipe cooked weight is required to log grams.");
  }

  const hasGramsConsumed = gramsConsumed != null;
  const factor = hasGramsConsumed
    ? (gramsConsumed / recipe.totalCookedWeightG!) * recipe.portions
    : portionCount;

  return {
    date,
    status: status ?? (date > today ? "planned" : "eaten"),
    label: hasGramsConsumed
      ? `${recipe.label} (${gramsConsumed}g)`
      : `${recipe.label} (${portionCount} portion${portionCount === 1 ? "" : "s"})`,
    quantity: gramsConsumed ?? portionCount,
    unit: hasGramsConsumed ? "g" : "serving",
    proteinG: Math.round(recipe.perPortionMacros.proteinG * factor * 10) / 10,
    carbsG: Math.round(recipe.perPortionMacros.carbsG * factor * 10) / 10,
    fatG: Math.round(recipe.perPortionMacros.fatG * factor * 10) / 10,
    caloriesKcal: Math.round(recipe.perPortionMacros.caloriesKcal * factor),
  };
}
