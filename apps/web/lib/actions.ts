"use server";

import {
  createMealEntry,
  createMealGroup,
  createPersonalFoodProduct,
  createRecipe,
  createTemplate,
  createTemplateFromDate,
  completeOnboardingSetup,
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
import type {
  BarcodeFoodProductInput,
  FoodProduct,
  FoodProductInput,
  LeaderboardStats,
  MacroFoodInput,
  MealEntryRecord,
  MealEntryStatus,
  MealGroup,
  MealTemplate,
  RecipeRecord,
  WeightUnit,
} from "@macro-tracker/db";
import { revalidatePath } from "next/cache";

import { requireSessionUser } from "./auth";
import { buildRecipePortionMealEntryInput } from "./recipe-portion";
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
  sortOrder?: number;
  clientMutationId?: string | null;
} & MacroFoodInput;

function toActionError(error: unknown) {
  if (!(error instanceof Error)) {
    return "Something went wrong.";
  }

  if (error.message.includes("Failed query:")) {
    return "Unable to save this change right now. Sign in again if the issue persists.";
  }

  return error.message;
}

type SessionUser = Awaited<ReturnType<typeof requireSessionUser>>;
type RevalidateTarget = readonly [path: string, type?: "page" | "layout"];

function revalidateTargets(targets: readonly RevalidateTarget[] = []) {
  for (const [path, type] of targets) {
    if (type) {
      revalidatePath(path, type);
    } else {
      revalidatePath(path);
    }
  }
}

async function runSessionAction<T extends ActionResult>(
  operation: (sessionUser: SessionUser) => Promise<T>,
  options: { revalidate?: readonly RevalidateTarget[] } = {},
): Promise<T> {
  const sessionUser = await requireSessionUser();

  try {
    const result = await operation(sessionUser);
    if (result.ok) {
      revalidateTargets(options.revalidate);
    }
    return result;
  } catch (error) {
    return {
      ok: false,
      error: toActionError(error),
    } as T;
  }
}

type SaveMealEntryResult = ActionResult & { entry?: MealEntryRecord };

export async function saveMealEntryAction(
  input: SaveMealEntryInput,
): Promise<SaveMealEntryResult> {
  return runSessionAction(async (sessionUser) => {
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

    return { ok: true, entry };
  }, { revalidate: [["/", "page"]] });
}

export async function markMealEntryStatusAction(
  input: { id: string; status: MealEntryStatus },
): Promise<SaveMealEntryResult> {
  return runSessionAction(async (sessionUser) => {
    const entry = await markMealEntryStatus(
      sessionUser.userId,
      input.id,
      input.status,
    );
    return { ok: true, entry };
  }, { revalidate: [["/", "page"]] });
}

export async function deleteMealEntryAction(
  input: { id: string },
): Promise<ActionResult> {
  return runSessionAction(async (sessionUser) => {
    const deleted = await deleteMealEntry(sessionUser.userId, input.id);
    if (!deleted) {
      return { ok: false, error: "Meal entry not found." };
    }

    return { ok: true };
  }, { revalidate: [["/", "page"]] });
}

type MealGroupResult = ActionResult & { group?: MealGroup; groups?: MealGroup[] };

export async function createMealGroupAction(
  input: { label: string },
): Promise<MealGroupResult> {
  return runSessionAction(async (sessionUser) => {
    const group = await createMealGroup(sessionUser.userId, input);
    return { ok: true, group };
  }, { revalidate: [["/", "page"]] });
}

export async function updateMealGroupAction(
  input: { id: string; label: string },
): Promise<MealGroupResult> {
  return runSessionAction(async (sessionUser) => {
    const group = await updateMealGroup(sessionUser.userId, input.id, {
      label: input.label,
    });
    return { ok: true, group };
  }, { revalidate: [["/", "page"]] });
}

export async function deleteMealGroupAction(
  input: { id: string },
): Promise<ActionResult> {
  return runSessionAction(async (sessionUser) => {
    const deleted = await deleteMealGroup(sessionUser.userId, input.id);
    if (!deleted) {
      return { ok: false, error: "Meal group not found." };
    }
    return { ok: true };
  }, { revalidate: [["/", "page"]] });
}

export async function reorderMealGroupsAction(
  input: { orderedIds: string[] },
): Promise<MealGroupResult> {
  return runSessionAction(async (sessionUser) => {
    const groups = await reorderMealGroups(sessionUser.userId, input.orderedIds);
    return { ok: true, groups };
  }, { revalidate: [["/", "page"]] });
}

type SaveGoalsInput = {
  caloriesKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
};

export async function saveGoalsAction(input: SaveGoalsInput): Promise<ActionResult> {
  return runSessionAction(async (sessionUser) => {
    await saveUserGoals(sessionUser.userId, input);
    return { ok: true };
  }, { revalidate: [["/", "layout"]] });
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
  return runSessionAction(async (sessionUser) => {
    const currentWeight =
      input.currentWeightKg != null &&
      Number.isFinite(input.currentWeightKg) &&
      input.currentWeightKg > 0
        ? {
            date: input.currentWeightDate,
            weightKg: input.currentWeightKg,
            bodyFatPct: null,
            notes: "Onboarding",
          }
        : null;
    const starterTemplate = input.starterTemplate?.label.trim()
      ? singleFoodTemplateInput(input.starterTemplate)
      : null;

    await completeOnboardingSetup(sessionUser.userId, {
      preferredWeightUnit: input.preferredWeightUnit,
      goals: input.goals,
      goalWeightKg: input.goalWeightKg,
      currentWeight,
      starterTemplate,
    });

    return { ok: true };
  }, { revalidate: [["/", "layout"]] });
}

type SaveTemplateInput = MacroFoodInput;
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
        productId:
          input.productId !== undefined
            ? input.productId
            : existingItem?.productId ?? null,
        mealGroupLabel: existingItem?.mealGroupLabel ?? null,
        label: input.label,
        quantity: input.quantity ?? existingItem?.quantity ?? 1,
        unit: input.unit ?? existingItem?.unit ?? ("serving" as const),
        servingMultiplier:
          input.servingMultiplier ?? existingItem?.servingMultiplier ?? 1,
        proteinG: input.proteinG,
        carbsG: input.carbsG,
        fatG: input.fatG,
        caloriesKcal: input.caloriesKcal,
      },
    ],
  };
}

export async function saveTemplateAction(input: SaveTemplateInput): Promise<SaveTemplateResult> {
  return runSessionAction(async (sessionUser) => {
    const template = await createTemplate(
      sessionUser.userId,
      singleFoodTemplateInput(input),
    );
    return { ok: true, template };
  });
}

export async function deleteTemplateAction(input: { id: string }): Promise<ActionResult> {
  return runSessionAction(async (sessionUser) => {
    const deleted = await deleteTemplate(sessionUser.userId, input.id);
    if (!deleted) {
      return { ok: false, error: "Template not found." };
    }

    return { ok: true };
  });
}

type UpdateTemplateInput = { id: string } & SaveTemplateInput;
type UpdateTemplateResult = ActionResult & { template?: MealTemplate };

export async function updateTemplateAction(input: UpdateTemplateInput): Promise<UpdateTemplateResult> {
  return runSessionAction(async (sessionUser) => {
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
  });
}

type ApplyTemplateResult = ActionResult & { entries?: MealEntryRecord[] };

export async function applyTemplateAction(input: {
  templateId: string;
  date: string;
  status?: MealEntryStatus;
}): Promise<ApplyTemplateResult> {
  return runSessionAction(async (sessionUser) => {
    const entries = await applyTemplateToDate(sessionUser.userId, input);
    return { ok: true, entries };
  }, { revalidate: [["/", "layout"]] });
}

export async function createTemplateFromDateAction(input: {
  date: string;
  type: "meal" | "day";
  label: string;
}): Promise<SaveTemplateResult> {
  return runSessionAction(async (sessionUser) => {
    const template = await createTemplateFromDate(sessionUser.userId, input);
    return { ok: true, template };
  }, { revalidate: [["/planner", "page"]] });
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
  return runSessionAction(async (sessionUser) => {
    await createWeightEntry(sessionUser.userId, input);
    return { ok: true };
  }, { revalidate: [["/weight", "page"]] });
}

export async function deleteWeightEntryAction(
  input: { id: string },
): Promise<ActionResult> {
  return runSessionAction(async (sessionUser) => {
    const deleted = await deleteWeightEntry(sessionUser.userId, input.id);
    if (!deleted) {
      return { ok: false, error: "Weight entry not found." };
    }

    return { ok: true };
  }, { revalidate: [["/weight", "page"]] });
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
  return runSessionAction(async (sessionUser) => {
    const updated = await updateWeightEntry(sessionUser.userId, input.id, {
      date: input.date,
      weightKg: input.weightKg,
      bodyFatPct: input.bodyFatPct,
      notes: input.notes,
    });

    if (!updated) {
      return { ok: false, error: "Weight entry not found." };
    }

    return { ok: true };
  }, { revalidate: [["/weight", "page"]] });
}

export async function saveWeightGoalAction(
  input: { goalWeightKg: number | null },
): Promise<ActionResult> {
  return runSessionAction(async (sessionUser) => {
    await saveWeightGoal(sessionUser.userId, input.goalWeightKg);
    return { ok: true };
  }, { revalidate: [["/weight", "page"]] });
}

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

type SaveRecipeInput = {
  id?: string;
  label: string;
  portions: number;
  totalCookedWeightG?: number | null;
  ingredients: MacroFoodInput[];
};

type SaveRecipeResult = ActionResult & { recipe?: RecipeRecord };

export async function saveRecipeAction(
  input: SaveRecipeInput,
): Promise<SaveRecipeResult> {
  return runSessionAction(async (sessionUser) => {
    const recipe = input.id
      ? await updateRecipe(sessionUser.userId, input.id, input)
      : await createRecipe(sessionUser.userId, input);
    return { ok: true, recipe };
  }, { revalidate: [["/recipes", "page"]] });
}

export async function deleteRecipeAction(
  input: { id: string },
): Promise<ActionResult> {
  return runSessionAction(async (sessionUser) => {
    const deleted = await deleteRecipe(sessionUser.userId, input.id);
    if (!deleted) {
      return { ok: false, error: "Recipe not found." };
    }

    return { ok: true };
  }, { revalidate: [["/recipes", "page"]] });
}

type SearchMealEntriesResult = ActionResult & { results?: MealEntryRecord[] };

export async function searchMealEntriesAction(
  input: { query: string },
): Promise<SearchMealEntriesResult> {
  return runSessionAction(async (sessionUser) => {
    const results = await searchMealEntries(sessionUser.userId, input.query);
    return { ok: true, results };
  });
}

type SearchFoodProductsResult = ActionResult & { products?: FoodProduct[] };

export async function searchFoodProductsAction(
  input: { query: string },
): Promise<SearchFoodProductsResult> {
  return runSessionAction(async (sessionUser) => {
    const products = await searchFoodProducts(sessionUser.userId, input.query);
    return { ok: true, products };
  });
}

type SearchFoodsResult = ActionResult & {
  results?: MealEntryRecord[];
  products?: FoodProduct[];
};

export async function searchFoodsAction(
  input: { query: string },
): Promise<SearchFoodsResult> {
  return runSessionAction(async (sessionUser) => {
    const query = input.query.trim();

    if (!query) {
      return { ok: true, results: [], products: [] };
    }

    const [historyResult, productsResult] = await Promise.allSettled([
      searchMealEntries(sessionUser.userId, query),
      searchFoodProducts(sessionUser.userId, query),
    ]);

    const results =
      historyResult.status === "fulfilled" ? historyResult.value : [];
    const products =
      productsResult.status === "fulfilled" ? productsResult.value : [];

    if (historyResult.status === "rejected" && productsResult.status === "rejected") {
      return { ok: false, error: toActionError(historyResult.reason) };
    }

    if (historyResult.status === "rejected") {
      return {
        ok: true,
        results,
        products,
        error: "Food history search failed, but product results are still available.",
      };
    }

    if (productsResult.status === "rejected") {
      return {
        ok: true,
        results,
        products,
        error: "Product search failed, but history results are still available.",
      };
    }

    return { ok: true, results, products };
  });
}

type SaveFoodProductResult = ActionResult & { product?: FoodProduct };

export async function createFoodProductAction(
  input: FoodProductInput,
): Promise<SaveFoodProductResult> {
  return runSessionAction(async (sessionUser) => {
    const product = await createPersonalFoodProduct(sessionUser.userId, input);
    return { ok: true, product };
  }, { revalidate: [["/", "layout"]] });
}

export async function updateFoodProductAction(
  input: { id: string; product: FoodProductInput },
): Promise<SaveFoodProductResult> {
  return runSessionAction(async (sessionUser) => {
    const product = await updatePersonalFoodProduct(
      sessionUser.userId,
      input.id,
      input.product,
    );
    return { ok: true, product };
  }, { revalidate: [["/", "layout"]] });
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
  return runSessionAction(async (sessionUser) => {
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

    await createMealEntry(
      sessionUser.userId,
      buildRecipePortionMealEntryInput({
        date: input.date,
        gramsConsumed,
        portionCount,
        recipe,
        status: input.status,
        today: getLocalDateString(),
      }),
    );

    return { ok: true };
  }, { revalidate: [["/", "page"]] });
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
  return runSessionAction(async (sessionUser) => {
    const product = await saveBarcodeFoodProduct(sessionUser.userId, input);
    return { ok: true, product };
  });
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

  return runSessionAction(async (sessionUser) => {
    const stats = await getLeaderboardStats(sessionUser.userId, input.referenceDate);
    return { ok: true, stats };
  });
}
