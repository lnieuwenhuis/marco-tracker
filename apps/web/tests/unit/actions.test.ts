import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  createMealEntry: vi.fn(),
  createMealGroup: vi.fn(),
  createPersonalFoodProduct: vi.fn(),
  createRecipe: vi.fn(),
  createTemplate: vi.fn(),
  createTemplateFromDate: vi.fn(),
  createWeightEntry: vi.fn(),
  completeUserOnboarding: vi.fn(),
  deleteMealGroup: vi.fn(),
  deleteMealEntry: vi.fn(),
  deleteRecipe: vi.fn(),
  deleteTemplate: vi.fn(),
  deleteWeightEntry: vi.fn(),
  getLeaderboardStats: vi.fn(),
  getRecipeById: vi.fn(),
  isValidDateString: vi.fn((value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)),
  markMealEntryStatus: vi.fn(),
  applyTemplateToDate: vi.fn(),
  reorderMealGroups: vi.fn(),
  saveBarcodeFoodProduct: vi.fn(),
  saveUserGoals: vi.fn(),
  saveWeightGoal: vi.fn(),
  searchFoodProducts: vi.fn(),
  searchMealEntries: vi.fn(),
  updateMealGroup: vi.fn(),
  updateMealEntry: vi.fn(),
  updatePersonalFoodProduct: vi.fn(),
  updateRecipe: vi.fn(),
  updateTemplate: vi.fn(),
  updateWeightEntry: vi.fn(),
  requireSessionUser: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@macro-tracker/db", () => ({
  createMealEntry: mocked.createMealEntry,
  createMealGroup: mocked.createMealGroup,
  createPersonalFoodProduct: mocked.createPersonalFoodProduct,
  createRecipe: mocked.createRecipe,
  createTemplate: mocked.createTemplate,
  createTemplateFromDate: mocked.createTemplateFromDate,
  createWeightEntry: mocked.createWeightEntry,
  completeUserOnboarding: mocked.completeUserOnboarding,
  deleteMealGroup: mocked.deleteMealGroup,
  deleteMealEntry: mocked.deleteMealEntry,
  deleteRecipe: mocked.deleteRecipe,
  deleteTemplate: mocked.deleteTemplate,
  deleteWeightEntry: mocked.deleteWeightEntry,
  getLeaderboardStats: mocked.getLeaderboardStats,
  getRecipeById: mocked.getRecipeById,
  isValidDateString: mocked.isValidDateString,
  markMealEntryStatus: mocked.markMealEntryStatus,
  applyTemplateToDate: mocked.applyTemplateToDate,
  reorderMealGroups: mocked.reorderMealGroups,
  saveBarcodeFoodProduct: mocked.saveBarcodeFoodProduct,
  saveUserGoals: mocked.saveUserGoals,
  saveWeightGoal: mocked.saveWeightGoal,
  searchFoodProducts: mocked.searchFoodProducts,
  searchMealEntries: mocked.searchMealEntries,
  updateMealGroup: mocked.updateMealGroup,
  updateMealEntry: mocked.updateMealEntry,
  updatePersonalFoodProduct: mocked.updatePersonalFoodProduct,
  updateRecipe: mocked.updateRecipe,
  updateTemplate: mocked.updateTemplate,
  updateWeightEntry: mocked.updateWeightEntry,
}));

vi.mock("@/lib/auth", () => ({
  requireSessionUser: mocked.requireSessionUser,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocked.revalidatePath,
}));

import {
  deleteMealEntryAction,
  deleteRecipeAction,
  deleteTemplateAction,
  deleteWeightEntryAction,
  fetchLeaderboardStatsAction,
  logRecipePortionAction,
} from "@/lib/actions";

describe("server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.requireSessionUser.mockResolvedValue({
      userId: "user-1",
      email: "coach@example.com",
    });
    mocked.isValidDateString.mockImplementation(
      (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value),
    );
  });

  it("passes the provided reference date through to leaderboard stats", async () => {
    mocked.getLeaderboardStats.mockResolvedValue({
      currentStreak: 3,
      longestStreak: 7,
      totalDaysTracked: 10,
      bestCalorieDay: null,
      bestProteinDay: null,
      bestCarbsDay: null,
      mostActiveDay: null,
    });

    const result = await fetchLeaderboardStatsAction({
      referenceDate: "2026-04-20",
    });

    expect(result).toMatchObject({ ok: true });
    expect(mocked.requireSessionUser).toHaveBeenCalledTimes(1);
    expect(mocked.getLeaderboardStats).toHaveBeenCalledWith(
      "user-1",
      "2026-04-20",
    );
  });

  it("rejects invalid leaderboard reference dates before hitting auth or the db", async () => {
    mocked.isValidDateString.mockReturnValue(false);

    const result = await fetchLeaderboardStatsAction({
      referenceDate: "not-a-date",
    });

    expect(result).toEqual({
      ok: false,
      error: "Invalid reference date.",
    });
    expect(mocked.requireSessionUser).not.toHaveBeenCalled();
    expect(mocked.getLeaderboardStats).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "meal entries",
      action: deleteMealEntryAction,
      deleter: mocked.deleteMealEntry,
      input: { id: "meal-1" },
      error: "Meal entry not found.",
    },
    {
      name: "templates",
      action: deleteTemplateAction,
      deleter: mocked.deleteTemplate,
      input: { id: "template-1" },
      error: "Template not found.",
    },
    {
      name: "weight entries",
      action: deleteWeightEntryAction,
      deleter: mocked.deleteWeightEntry,
      input: { id: "weight-1" },
      error: "Weight entry not found.",
    },
    {
      name: "recipes",
      action: deleteRecipeAction,
      deleter: mocked.deleteRecipe,
      input: { id: "recipe-1" },
      error: "Recipe not found.",
    },
  ])("returns a failure when deleting missing $name", async ({
    action,
    deleter,
    input,
    error,
  }) => {
    deleter.mockResolvedValue(false);

    const result = await action(input);

    expect(result).toEqual({ ok: false, error });
    expect(mocked.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([0, -10, Number.NaN])(
    "rejects invalid recipe grams before creating a meal",
    async (gramsConsumed) => {
      mocked.getRecipeById.mockResolvedValue({
        id: "recipe-1",
        userId: "user-1",
        label: "Rice bowl",
        portions: 4,
        totalCookedWeightG: 800,
        perPortionMacros: {
          proteinG: 20,
          carbsG: 60,
          fatG: 10,
          caloriesKcal: 420,
        },
        totalMacros: {
          proteinG: 80,
          carbsG: 240,
          fatG: 40,
          caloriesKcal: 1680,
        },
        ingredients: [],
      });

      const result = await logRecipePortionAction({
        recipeId: "recipe-1",
        date: "2026-05-10",
        gramsConsumed,
      });

      expect(result).toEqual({
        ok: false,
        error: "Grams consumed must be greater than 0.",
      });
      expect(mocked.createMealEntry).not.toHaveBeenCalled();
      expect(mocked.revalidatePath).not.toHaveBeenCalled();
    },
  );
});
