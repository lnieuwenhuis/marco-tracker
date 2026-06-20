"use server";

import {
  createMealEntry,
  createMealGroup,
  createPersonalFoodProduct,
  createRecipe,
  createTemplate,
  createTemplateFromDate,
  completeUserOnboarding,
  deleteMealGroup,
  createWeightEntry,
  deleteMealEntry,
  deleteRecipe,
  deleteTemplate,
  deleteWeightEntry,
  getLeaderboardStats,
  getRecipeById,
  getTemplateById,
  markMealEntryStatus,
  applyTemplateToDate,
  reorderMealGroups,
  saveBarcodeFoodProduct,
  saveUserGoals,
  saveWeightGoal,
  searchFoodProducts,
  searchMealEntries,
  updateMealGroup,
  updateMealEntry,
  updatePersonalFoodProduct,
  updateRecipe,
  updateTemplate,
  updateWeightEntry,
  isValidDateString,
} from "@macro-tracker/db";
import type { BarcodeFoodProductInput, FoodProduct, FoodProductInput, LeaderboardStats, MealEntryRecord, MealEntryStatus, MealGroup, MealTemplate, QuantityUnit, RecipeRecord, WeightUnit } from "@macro-tracker/db";
import { revalidatePath } from "next/cache";

import { requireSessionUser } from "./auth";
import { getLocalDateString } from "./startup-date";

type ActionResult = {
  ok: boolean;
  error?: string;
};

type SaveMealEntryInput = {
  id?: string;
  date: string;
  mealGroupId?: string | null;
  status?: MealEntryStatus;
  productId?: string | null;
  label: string;
  sortOrder?: number;
  quantity?: number;
  unit?: QuantityUnit;
  servingMultiplier?: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  caloriesKcal: number;
  clientMutationId?: string | null;
};

function toActionError(error: unknown) {
  if (!(error instanceof Error)) {
    return "Something went wrong.";
  }

  if (error.message.includes("Failed query:")) {
    return "Unable to save this change right now. Sign in again if the issue persists.";
  }

  return error.message;
}

type SaveMealEntryResult = ActionResult & { entry?: MealEntryRecord };

export async function saveMealEntryAction(
  input: SaveMealEntryInput,
): Promise<SaveMealEntryResult> {
  const sessionUser = await requireSessionUser();

  try {
    const entry = input.id
      ? await updateMealEntry(sessionUser.userId, input.id, {
          date: input.date,
          mealGroupId: input.mealGroupId,
          status: input.status,
          productId: input.productId,
          label: input.label,
          sortOrder: input.sortOrder ?? 0,
          quantity: input.quantity,
          unit: input.unit,
          servingMultiplier: input.servingMultiplier,
          proteinG: input.proteinG,
          carbsG: input.carbsG,
          fatG: input.fatG,
          caloriesKcal: input.caloriesKcal,
          clientMutationId: input.clientMutationId,
        })
      : await createMealEntry(sessionUser.userId, {
          date: input.date,
          mealGroupId: input.mealGroupId,
          status: input.status,
          productId: input.productId,
          label: input.label,
          sortOrder: input.sortOrder,
          quantity: input.quantity,
          unit: input.unit,
          servingMultiplier: input.servingMultiplier,
          proteinG: input.proteinG,
          carbsG: input.carbsG,
          fatG: input.fatG,
          caloriesKcal: input.caloriesKcal,
          clientMutationId: input.clientMutationId,
        });

    revalidatePath("/", "page");
    return { ok: true, entry };
  } catch (error) {
    return {
      ok: false,
      error: toActionError(error),
    };
  }
}

export async function markMealEntryStatusAction(
  input: { id: string; status: MealEntryStatus },
): Promise<SaveMealEntryResult> {
  const sessionUser = await requireSessionUser();

  try {
    const entry = await markMealEntryStatus(
      sessionUser.userId,
      input.id,
      input.status,
    );
    revalidatePath("/", "page");
    return { ok: true, entry };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deleteMealEntryAction(
  input: { id: string },
): Promise<ActionResult> {
  const sessionUser = await requireSessionUser();

  try {
    const deleted = await deleteMealEntry(sessionUser.userId, input.id);
    if (!deleted) {
      return { ok: false, error: "Meal entry not found." };
    }

    revalidatePath("/", "page");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: toActionError(error),
    };
  }
}

type MealGroupResult = ActionResult & { group?: MealGroup; groups?: MealGroup[] };

export async function createMealGroupAction(
  input: { label: string },
): Promise<MealGroupResult> {
  const sessionUser = await requireSessionUser();
  try {
    const group = await createMealGroup(sessionUser.userId, input);
    revalidatePath("/", "page");
    return { ok: true, group };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function updateMealGroupAction(
  input: { id: string; label: string },
): Promise<MealGroupResult> {
  const sessionUser = await requireSessionUser();
  try {
    const group = await updateMealGroup(sessionUser.userId, input.id, {
      label: input.label,
    });
    revalidatePath("/", "page");
    return { ok: true, group };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deleteMealGroupAction(
  input: { id: string },
): Promise<ActionResult> {
  const sessionUser = await requireSessionUser();
  try {
    const deleted = await deleteMealGroup(sessionUser.userId, input.id);
    if (!deleted) {
      return { ok: false, error: "Meal group not found." };
    }
    revalidatePath("/", "page");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function reorderMealGroupsAction(
  input: { orderedIds: string[] },
): Promise<MealGroupResult> {
  const sessionUser = await requireSessionUser();
  try {
    const groups = await reorderMealGroups(sessionUser.userId, input.orderedIds);
    revalidatePath("/", "page");
    return { ok: true, groups };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

type SaveGoalsInput = {
  caloriesKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
};

export async function saveGoalsAction(input: SaveGoalsInput): Promise<ActionResult> {
  const sessionUser = await requireSessionUser();

  try {
    await saveUserGoals(sessionUser.userId, input);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: toActionError(error),
    };
  }
}

type CompleteOnboardingActionInput = {
  preferredWeightUnit: WeightUnit;
  goals: SaveGoalsInput;
  goalWeightKg: number | null;
  currentWeightKg: number | null;
  currentWeightDate: string;
  starterTemplate:
    | {
        label: string;
        proteinG: number;
        carbsG: number;
        fatG: number;
        caloriesKcal: number;
      }
    | null;
};

export async function completeOnboardingAction(
  input: CompleteOnboardingActionInput,
): Promise<ActionResult> {
  const sessionUser = await requireSessionUser();

  try {
    await saveUserGoals(sessionUser.userId, input.goals);
    await saveWeightGoal(sessionUser.userId, input.goalWeightKg);

    if (
      input.currentWeightKg != null &&
      Number.isFinite(input.currentWeightKg) &&
      input.currentWeightKg > 0
    ) {
      await createWeightEntry(sessionUser.userId, {
        date: input.currentWeightDate,
        weightKg: input.currentWeightKg,
        bodyFatPct: null,
        notes: "Onboarding",
      });
    }

    if (input.starterTemplate?.label.trim()) {
      await createTemplate(
        sessionUser.userId,
        singleFoodTemplateInput(input.starterTemplate),
      );
    }

    await completeUserOnboarding(sessionUser.userId, {
      preferredWeightUnit: input.preferredWeightUnit,
    });

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

type SaveTemplateInput = {
  label: string;
  proteinG: number;
  carbsG: number;
  fatG: number;
  caloriesKcal: number;
};
type SaveTemplateResult = ActionResult & { template?: MealTemplate };

function singleFoodTemplateInput(
  input: SaveTemplateInput,
  existingItem?: MealTemplate["items"][number],
) {
  return {
    type: "meal" as const,
    label: input.label,
    items: [
      {
        productId: existingItem?.productId ?? null,
        mealGroupLabel: existingItem?.mealGroupLabel ?? null,
        label: input.label,
        quantity: existingItem?.quantity ?? 1,
        unit: existingItem?.unit ?? "serving" as const,
        servingMultiplier: existingItem?.servingMultiplier ?? 1,
        proteinG: input.proteinG,
        carbsG: input.carbsG,
        fatG: input.fatG,
        caloriesKcal: input.caloriesKcal,
      },
    ],
  };
}

export async function saveTemplateAction(input: SaveTemplateInput): Promise<SaveTemplateResult> {
  const sessionUser = await requireSessionUser();

  try {
    const template = await createTemplate(
      sessionUser.userId,
      singleFoodTemplateInput(input),
    );
    return { ok: true, template };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deleteTemplateAction(input: { id: string }): Promise<ActionResult> {
  const sessionUser = await requireSessionUser();

  try {
    const deleted = await deleteTemplate(sessionUser.userId, input.id);
    if (!deleted) {
      return { ok: false, error: "Template not found." };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

type UpdateTemplateInput = { id: string } & SaveTemplateInput;
type UpdateTemplateResult = ActionResult & { template?: MealTemplate };

export async function updateTemplateAction(input: UpdateTemplateInput): Promise<UpdateTemplateResult> {
  const sessionUser = await requireSessionUser();

  try {
    const existingTemplate = await getTemplateById(sessionUser.userId, input.id);
    if (!existingTemplate) {
      return { ok: false, error: "Template not found." };
    }
    if (existingTemplate.type !== "meal" || existingTemplate.items.length !== 1) {
      return {
        ok: false,
        error: "This template cannot be edited from the single-food template form.",
      };
    }

    const template = await updateTemplate(
      sessionUser.userId,
      input.id,
      singleFoodTemplateInput(input, existingTemplate.items[0]),
    );
    return { ok: true, template };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

type ApplyTemplateResult = ActionResult & { entries?: MealEntryRecord[] };

export async function applyTemplateAction(input: {
  templateId: string;
  date: string;
  status?: MealEntryStatus;
}): Promise<ApplyTemplateResult> {
  const sessionUser = await requireSessionUser();

  try {
    const entries = await applyTemplateToDate(sessionUser.userId, input);
    revalidatePath("/", "layout");
    return { ok: true, entries };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function createTemplateFromDateAction(input: {
  date: string;
  type: "meal" | "day";
  label: string;
}): Promise<SaveTemplateResult> {
  const sessionUser = await requireSessionUser();

  try {
    const template = await createTemplateFromDate(sessionUser.userId, input);
    revalidatePath("/planner", "page");
    return { ok: true, template };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

// ---------------------------------------------------------------------------
// Weight tracking
// ---------------------------------------------------------------------------

type SaveWeightEntryInput = {
  date: string;
  weightKg: number;
  bodyFatPct: number | null;
  notes: string | null;
};

export async function saveWeightEntryAction(
  input: SaveWeightEntryInput,
): Promise<ActionResult> {
  const sessionUser = await requireSessionUser();

  try {
    await createWeightEntry(sessionUser.userId, input);
    revalidatePath("/weight", "page");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deleteWeightEntryAction(
  input: { id: string },
): Promise<ActionResult> {
  const sessionUser = await requireSessionUser();

  try {
    const deleted = await deleteWeightEntry(sessionUser.userId, input.id);
    if (!deleted) {
      return { ok: false, error: "Weight entry not found." };
    }

    revalidatePath("/weight", "page");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

type UpdateWeightEntryInput = {
  id: string;
  date: string;
  weightKg: number;
  bodyFatPct: number | null;
  notes: string | null;
};

export async function updateWeightEntryAction(
  input: UpdateWeightEntryInput,
): Promise<ActionResult> {
  const sessionUser = await requireSessionUser();

  try {
    const updated = await updateWeightEntry(sessionUser.userId, input.id, {
      date: input.date,
      weightKg: input.weightKg,
      bodyFatPct: input.bodyFatPct,
      notes: input.notes,
    });

    if (!updated) {
      return { ok: false, error: "Weight entry not found." };
    }

    revalidatePath("/weight", "page");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function saveWeightGoalAction(
  input: { goalWeightKg: number | null },
): Promise<ActionResult> {
  const sessionUser = await requireSessionUser();

  try {
    await saveWeightGoal(sessionUser.userId, input.goalWeightKg);
    revalidatePath("/weight", "page");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

type SaveRecipeInput = {
  id?: string;
  label: string;
  portions: number;
  totalCookedWeightG?: number | null;
  ingredients: Array<{
    productId?: string | null;
    label: string;
    quantity?: number;
    unit?: QuantityUnit;
    servingMultiplier?: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    caloriesKcal: number;
  }>;
};

type SaveRecipeResult = ActionResult & { recipe?: RecipeRecord };

export async function saveRecipeAction(
  input: SaveRecipeInput,
): Promise<SaveRecipeResult> {
  const sessionUser = await requireSessionUser();

  try {
    const recipe = input.id
      ? await updateRecipe(sessionUser.userId, input.id, input)
      : await createRecipe(sessionUser.userId, input);
    revalidatePath("/recipes", "page");
    return { ok: true, recipe };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deleteRecipeAction(
  input: { id: string },
): Promise<ActionResult> {
  const sessionUser = await requireSessionUser();

  try {
    const deleted = await deleteRecipe(sessionUser.userId, input.id);
    if (!deleted) {
      return { ok: false, error: "Recipe not found." };
    }

    revalidatePath("/recipes", "page");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

type SearchMealEntriesResult = ActionResult & { results?: MealEntryRecord[] };

export async function searchMealEntriesAction(
  input: { query: string },
): Promise<SearchMealEntriesResult> {
  const sessionUser = await requireSessionUser();

  try {
    const results = await searchMealEntries(sessionUser.userId, input.query);
    return { ok: true, results };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

type SearchFoodProductsResult = ActionResult & { products?: FoodProduct[] };

export async function searchFoodProductsAction(
  input: { query: string },
): Promise<SearchFoodProductsResult> {
  const sessionUser = await requireSessionUser();

  try {
    const products = await searchFoodProducts(sessionUser.userId, input.query);
    return { ok: true, products };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

type SaveFoodProductResult = ActionResult & { product?: FoodProduct };

export async function createFoodProductAction(
  input: FoodProductInput,
): Promise<SaveFoodProductResult> {
  const sessionUser = await requireSessionUser();

  try {
    const product = await createPersonalFoodProduct(sessionUser.userId, input);
    revalidatePath("/", "layout");
    return { ok: true, product };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function updateFoodProductAction(
  input: { id: string; product: FoodProductInput },
): Promise<SaveFoodProductResult> {
  const sessionUser = await requireSessionUser();

  try {
    const product = await updatePersonalFoodProduct(
      sessionUser.userId,
      input.id,
      input.product,
    );
    revalidatePath("/", "layout");
    return { ok: true, product };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

type LogRecipePortionInput = {
  recipeId: string;
  date: string;
  status?: MealEntryStatus;
  portionCount?: number;
  gramsConsumed?: number | null;
};

export async function logRecipePortionAction(
  input: LogRecipePortionInput,
): Promise<ActionResult> {
  const sessionUser = await requireSessionUser();

  try {
    const recipe = await getRecipeById(sessionUser.userId, input.recipeId);
    if (!recipe) {
      throw new Error("Recipe not found.");
    }

    const portionCount =
      Number.isFinite(input.portionCount) && (input.portionCount ?? 0) > 0
        ? input.portionCount!
        : 1;
    const gramsConsumed = input.gramsConsumed ?? null;
    if (
      gramsConsumed != null &&
      (!Number.isFinite(gramsConsumed) || gramsConsumed <= 0)
    ) {
      throw new Error("Grams consumed must be greater than 0.");
    }
    if (
      gramsConsumed != null &&
      (recipe.totalCookedWeightG == null || recipe.totalCookedWeightG <= 0)
    ) {
      throw new Error("Recipe cooked weight is required to log grams.");
    }

    const hasGramsConsumed = gramsConsumed != null;
    const factor =
      hasGramsConsumed
        ? (gramsConsumed / recipe.totalCookedWeightG!) * recipe.portions
        : portionCount;

    await createMealEntry(sessionUser.userId, {
      date: input.date,
      status:
        input.status ??
        (input.date > getLocalDateString() ? "planned" : "eaten"),
      label:
        hasGramsConsumed
          ? `${recipe.label} (${gramsConsumed}g)`
          : `${recipe.label} (${portionCount} portion${portionCount === 1 ? "" : "s"})`,
      quantity: gramsConsumed ?? portionCount,
      unit: hasGramsConsumed ? "g" : "serving",
      proteinG: Math.round(recipe.perPortionMacros.proteinG * factor * 10) / 10,
      carbsG: Math.round(recipe.perPortionMacros.carbsG * factor * 10) / 10,
      fatG: Math.round(recipe.perPortionMacros.fatG * factor * 10) / 10,
      caloriesKcal: Math.round(recipe.perPortionMacros.caloriesKcal * factor),
    });

    revalidatePath("/", "page");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

// ---------------------------------------------------------------------------
// Community barcode catalogue
// ---------------------------------------------------------------------------

type SaveBarcodeFoodProductResult = ActionResult & {
  product?: FoodProduct;
};

export async function saveBarcodeFoodProductAction(
  input: BarcodeFoodProductInput,
): Promise<SaveBarcodeFoodProductResult> {
  const sessionUser = await requireSessionUser();

  try {
    const product = await saveBarcodeFoodProduct(sessionUser.userId, input);
    return { ok: true, product };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

// ---------------------------------------------------------------------------
// Leaderboard / personal records
// ---------------------------------------------------------------------------

type FetchLeaderboardResult =
  | { ok: true; stats: LeaderboardStats }
  | { ok: false; error: string };

export async function fetchLeaderboardStatsAction(
  input: { referenceDate: string },
): Promise<FetchLeaderboardResult> {
  if (!isValidDateString(input.referenceDate)) {
    return { ok: false, error: "Invalid reference date." };
  }

  const sessionUser = await requireSessionUser();
  try {
    const stats = await getLeaderboardStats(sessionUser.userId, input.referenceDate);
    return { ok: true, stats };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
