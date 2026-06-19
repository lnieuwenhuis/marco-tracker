import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  createMealEntry: vi.fn(),
  createPreset: vi.fn(),
  createRecipe: vi.fn(),
  createWeightEntry: vi.fn(),
  deleteMealEntry: vi.fn(),
  deletePreset: vi.fn(),
  deleteRecipe: vi.fn(),
  deleteWeightEntry: vi.fn(),
  getLeaderboardStats: vi.fn(),
  getRecipeById: vi.fn(),
  isValidDateString: vi.fn((value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)),
  saveCustomBarcodeProduct: vi.fn(),
  saveUserGoals: vi.fn(),
  saveWeightGoal: vi.fn(),
  searchMealEntries: vi.fn(),
  touchPresetLastUsed: vi.fn(),
  updateMealEntry: vi.fn(),
  updatePreset: vi.fn(),
  updateRecipe: vi.fn(),
  updateWeightEntry: vi.fn(),
  requireSessionUser: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@macro-tracker/db", () => ({
  createMealEntry: mocked.createMealEntry,
  createPreset: mocked.createPreset,
  createRecipe: mocked.createRecipe,
  createWeightEntry: mocked.createWeightEntry,
  deleteMealEntry: mocked.deleteMealEntry,
  deletePreset: mocked.deletePreset,
  deleteRecipe: mocked.deleteRecipe,
  deleteWeightEntry: mocked.deleteWeightEntry,
  getLeaderboardStats: mocked.getLeaderboardStats,
  getRecipeById: mocked.getRecipeById,
  isValidDateString: mocked.isValidDateString,
  saveCustomBarcodeProduct: mocked.saveCustomBarcodeProduct,
  saveUserGoals: mocked.saveUserGoals,
  saveWeightGoal: mocked.saveWeightGoal,
  searchMealEntries: mocked.searchMealEntries,
  touchPresetLastUsed: mocked.touchPresetLastUsed,
  updateMealEntry: mocked.updateMealEntry,
  updatePreset: mocked.updatePreset,
  updateRecipe: mocked.updateRecipe,
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
  deletePresetAction,
  deleteRecipeAction,
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
      name: "presets",
      action: deletePresetAction,
      deleter: mocked.deletePreset,
      input: { id: "preset-1" },
      error: "Preset not found.",
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
