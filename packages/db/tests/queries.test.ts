import {
  computeStreaks,
  createMealGroup,
  createRecipe,
  createMealEntry,
  createPersonalFoodProduct,
  deleteMealGroup,
  deleteMealEntry,
  ensureDefaultMealGroups,
  getDailySummary,
  getMealGroups,
  getPeriodAverages,
  getRecipeById,
  getRecentQuickAddCandidates,
  markMealEntryStatus,
  resolveProductNutritionForQuantity,
  searchFoodProducts,
  updateRecipe,
  updateMealEntry,
  upsertUserFromShooProfile,
  type DatabaseRuntime,
} from "../src";
import { foodProducts, mealEntries, recipeIngredients, recipes } from "../src/schema";
import { createTestDatabase } from "../src/testing";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("database queries", () => {
  let runtime: DatabaseRuntime;
  let userId: string;

  beforeEach(async () => {
    runtime = await createTestDatabase();
    const user = await upsertUserFromShooProfile(
      {
        pairwiseSub: "ps_test_user",
        email: "coach@example.com",
        displayName: "Coach",
      },
      runtime.db,
    );
    userId = user.id;
  });

  afterEach(async () => {
    await runtime.close();
  });

  async function createMealWithCreatedAt(
    input: Parameters<typeof createMealEntry>[1],
    createdAtIso: string,
  ) {
    const entry = await createMealEntry(userId, input, runtime.db);
    const timestamp = new Date(createdAtIso);

    await runtime.db
      .update(mealEntries)
      .set({
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .where(eq(mealEntries.id, entry.id));

    return entry;
  }

  async function createOtherUser() {
    const user = await upsertUserFromShooProfile(
      {
        pairwiseSub: "ps_other_user",
        email: "other@example.com",
        displayName: "Other",
      },
      runtime.db,
    );

    return user.id;
  }

  function createFailingRecipeDb(failOnIngredientInsertNumber: number) {
    let ingredientInsertCount = 0;

    function wrapClient(client: any) {
      return new Proxy(client, {
        get(target, prop, receiver) {
          if (prop === "insert") {
            return (table: unknown) => {
              if (table === recipeIngredients) {
                ingredientInsertCount += 1;
                if (ingredientInsertCount === failOnIngredientInsertNumber) {
                  throw new Error("Forced ingredient insert failure.");
                }
              }

              return target.insert(table);
            };
          }

          if (prop === "transaction") {
            return async (callback: (tx: unknown) => unknown) =>
              target.transaction(async (tx: unknown) => callback(wrapClient(tx)));
          }

          const value = Reflect.get(target, prop, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    }

    return wrapClient(runtime.db as any);
  }

  function createFailingMealGroupDeleteDb() {
    function wrapClient(client: any) {
      return new Proxy(client, {
        get(target, prop, receiver) {
          if (prop === "update") {
            return (table: unknown) => {
              if (table === mealEntries) {
                throw new Error("Forced meal group unassign failure.");
              }

              return target.update(table);
            };
          }

          if (prop === "transaction") {
            return async (callback: (tx: unknown) => unknown) =>
              target.transaction(async (tx: unknown) => callback(wrapClient(tx)));
          }

          const value = Reflect.get(target, prop, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    }

    return wrapClient(runtime.db as any);
  }

  it("calculates daily totals and logged-day-only averages", async () => {
    await createMealEntry(
      userId,
      {
        date: "2026-03-17",
        label: "Lunch",
        proteinG: 30,
        carbsG: 40,
        fatG: 10,
        caloriesKcal: 370,
      },
      runtime.db,
    );
    await createMealEntry(
      userId,
      {
        date: "2026-03-19",
        label: "Breakfast",
        proteinG: 20,
        carbsG: 30,
        fatG: 10,
        caloriesKcal: 290,
      },
      runtime.db,
    );
    await createMealEntry(
      userId,
      {
        date: "2026-03-19",
        label: "Dinner",
        proteinG: 30,
        carbsG: 30,
        fatG: 10,
        caloriesKcal: 330,
      },
      runtime.db,
    );
    await createMealEntry(
      userId,
      {
        date: "2026-03-01",
        label: "Snack",
        proteinG: 20,
        carbsG: 10,
        fatG: 5,
        caloriesKcal: 165,
      },
      runtime.db,
    );

    const dailySummary = await getDailySummary(userId, "2026-03-19", runtime.db);
    expect(dailySummary.totals).toEqual({
      proteinG: 50,
      carbsG: 60,
      fatG: 20,
      caloriesKcal: 620,
    });

    const periodAverages = await getPeriodAverages(userId, "2026-03-19", runtime.db);
    const week = periodAverages.find((item) => item.label === "week");
    const month = periodAverages.find((item) => item.label === "month");
    const rolling7 = periodAverages.find((item) => item.label === "rolling7");
    const rolling30 = periodAverages.find((item) => item.label === "rolling30");

    expect(week).toMatchObject({
      loggedDays: 2,
      averages: {
        proteinG: 40,
        carbsG: 50,
        fatG: 15,
        caloriesKcal: 495,
      },
    });
    expect(month?.loggedDays).toBe(3);
    expect(month?.averages.proteinG).toBeCloseTo(33.3, 1);
    expect(month?.averages.carbsG).toBeCloseTo(36.7, 1);
    expect(month?.averages.fatG).toBeCloseTo(11.7, 1);
    expect(month?.averages.caloriesKcal).toBe(385);
    expect(rolling7?.loggedDays).toBe(2);
    expect(rolling30?.loggedDays).toBe(3);
  });

  it("creates, updates, and deletes meal entries while keeping totals in sync", async () => {
    const breakfast = await createMealEntry(
      userId,
      {
        date: "2026-03-21",
        label: "Breakfast",
        proteinG: 25,
        carbsG: 45,
        fatG: 12,
        caloriesKcal: 390,
      },
      runtime.db,
    );
    const dinner = await createMealEntry(
      userId,
      {
        date: "2026-03-21",
        label: "Dinner",
        proteinG: 35,
        carbsG: 55,
        fatG: 18,
        caloriesKcal: 550,
      },
      runtime.db,
    );

    let dailySummary = await getDailySummary(userId, "2026-03-21", runtime.db);
    expect(dailySummary.totals).toEqual({
      proteinG: 60,
      carbsG: 100,
      fatG: 30,
      caloriesKcal: 940,
    });

    await updateMealEntry(
      userId,
      breakfast.id,
      {
        date: "2026-03-21",
        label: "Breakfast",
        sortOrder: breakfast.sortOrder,
        proteinG: 30,
        carbsG: 42,
        fatG: 11,
        caloriesKcal: 395,
      },
      runtime.db,
    );

    dailySummary = await getDailySummary(userId, "2026-03-21", runtime.db);
    expect(dailySummary.totals).toEqual({
      proteinG: 65,
      carbsG: 97,
      fatG: 29,
      caloriesKcal: 945,
    });

    await deleteMealEntry(userId, dinner.id, runtime.db);
    dailySummary = await getDailySummary(userId, "2026-03-21", runtime.db);

    expect(dailySummary.meals).toHaveLength(1);
    expect(dailySummary.totals).toEqual({
      proteinG: 30,
      carbsG: 42,
      fatG: 11,
      caloriesKcal: 395,
    });
  });

  it("tracks meal groups and excludes planned or skipped entries from eaten totals", async () => {
    const groups = await getMealGroups(userId, runtime.db);
    expect(groups.map((group) => group.label)).toEqual([
      "Breakfast",
      "Lunch",
      "Dinner",
      "Snack",
    ]);

    const supper = await createMealGroup(userId, { label: "Supper" }, runtime.db);
    const eaten = await createMealEntry(
      userId,
      {
        date: "2026-04-12",
        mealGroupId: supper.id,
        label: "Salmon bowl",
        proteinG: 40,
        carbsG: 50,
        fatG: 18,
        caloriesKcal: 520,
      },
      runtime.db,
    );
    const planned = await createMealEntry(
      userId,
      {
        date: "2026-04-12",
        status: "planned",
        label: "Evening shake",
        proteinG: 30,
        carbsG: 10,
        fatG: 2,
        caloriesKcal: 180,
      },
      runtime.db,
    );

    let summary = await getDailySummary(userId, "2026-04-12", runtime.db);
    expect(summary.totals.caloriesKcal).toBe(520);
    expect(summary.plannedTotals.caloriesKcal).toBe(180);
    expect(summary.meals.find((meal) => meal.id === eaten.id)?.mealGroupId).toBe(supper.id);

    await markMealEntryStatus(userId, planned.id, "eaten", runtime.db);
    summary = await getDailySummary(userId, "2026-04-12", runtime.db);
    expect(summary.totals.caloriesKcal).toBe(700);
    expect(summary.plannedTotals.caloriesKcal).toBe(0);
  });

  it("rejects inaccessible or deleted meal groups on meal entry saves", async () => {
    const otherUserId = await createOtherUser();
    const otherGroup = await createMealGroup(
      otherUserId,
      { label: "Other user's dinner" },
      runtime.db,
    );

    await expect(
      createMealEntry(
        userId,
        {
          date: "2026-05-01",
          mealGroupId: otherGroup.id,
          label: "Cross-user group",
          proteinG: 10,
          carbsG: 10,
          fatG: 5,
          caloriesKcal: 125,
        },
        runtime.db,
      ),
    ).rejects.toThrow("Meal group not found.");

    const meal = await createMealEntry(
      userId,
      {
        date: "2026-05-01",
        label: "Owned meal",
        proteinG: 20,
        carbsG: 20,
        fatG: 10,
        caloriesKcal: 250,
      },
      runtime.db,
    );

    await expect(
      updateMealEntry(
        userId,
        meal.id,
        {
          date: meal.date,
          mealGroupId: otherGroup.id,
          label: meal.label,
          sortOrder: meal.sortOrder,
          proteinG: 25,
          carbsG: 20,
          fatG: 10,
          caloriesKcal: 270,
        },
        runtime.db,
      ),
    ).rejects.toThrow("Meal group not found.");

    const deletedGroup = await createMealGroup(
      userId,
      { label: "Temporary" },
      runtime.db,
    );
    await deleteMealGroup(userId, deletedGroup.id, runtime.db);

    await expect(
      createMealEntry(
        userId,
        {
          date: "2026-05-01",
          mealGroupId: deletedGroup.id,
          label: "Deleted group",
          proteinG: 10,
          carbsG: 10,
          fatG: 5,
          caloriesKcal: 125,
        },
        runtime.db,
      ),
    ).rejects.toThrow("Meal group not found.");
  });

  it("rejects inaccessible products and hides their labels from daily summaries", async () => {
    const otherUserId = await createOtherUser();
    const otherProduct = await createPersonalFoodProduct(
      otherUserId,
      {
        name: "Other user's yogurt",
        source: "manual",
        proteinPer100: 10,
        carbsPer100: 4,
        fatPer100: 2,
        caloriesPer100: 74,
      },
      runtime.db,
    );

    await expect(
      createMealEntry(
        userId,
        {
          date: "2026-05-02",
          productId: otherProduct.id,
          label: "Cross-user product",
          proteinG: 15,
          carbsG: 6,
          fatG: 3,
          caloriesKcal: 111,
        },
        runtime.db,
      ),
    ).rejects.toThrow("Food product not found.");

    const meal = await createMealEntry(
      userId,
      {
        date: "2026-05-02",
        label: "Manual meal",
        proteinG: 20,
        carbsG: 20,
        fatG: 10,
        caloriesKcal: 250,
      },
      runtime.db,
    );

    await expect(
      updateMealEntry(
        userId,
        meal.id,
        {
          date: meal.date,
          productId: otherProduct.id,
          label: meal.label,
          sortOrder: meal.sortOrder,
          proteinG: 25,
          carbsG: 20,
          fatG: 10,
          caloriesKcal: 270,
        },
        runtime.db,
      ),
    ).rejects.toThrow("Food product not found.");

    const deletedProduct = await createPersonalFoodProduct(
      userId,
      {
        name: "Deleted product",
        source: "manual",
        proteinPer100: 10,
        carbsPer100: 4,
        fatPer100: 2,
        caloriesPer100: 74,
      },
      runtime.db,
    );
    await runtime.db
      .update(foodProducts)
      .set({ deletedAt: new Date() })
      .where(eq(foodProducts.id, deletedProduct.id));

    await expect(
      createMealEntry(
        userId,
        {
          date: "2026-05-02",
          productId: deletedProduct.id,
          label: "Deleted product meal",
          proteinG: 15,
          carbsG: 6,
          fatG: 3,
          caloriesKcal: 111,
        },
        runtime.db,
      ),
    ).rejects.toThrow("Food product not found.");

    await runtime.db.insert(mealEntries).values({
      id: randomUUID(),
      userId,
      entryDate: "2026-05-03",
      productId: otherProduct.id,
      label: "Bad legacy link",
      sortOrder: 0,
      proteinG: "1.0",
      carbsG: "1.0",
      fatG: "1.0",
      caloriesKcal: 16,
      updatedAt: new Date(),
    });

    const summary = await getDailySummary(userId, "2026-05-03", runtime.db);
    expect(summary.meals).toHaveLength(1);
    expect(summary.meals[0]?.productId).toBeNull();
    expect(summary.meals[0]?.sourceLabel).toBeNull();
  });

  it("preserves manual macro edits for legacy product-linked meals", async () => {
    const legacyProduct = await createPersonalFoodProduct(
      userId,
      {
        name: "Legacy oats",
        scope: "legacy",
        source: "legacy",
        defaultServingQuantity: 1,
        defaultServingUnit: "serving",
        proteinPer100: 100,
        carbsPer100: 100,
        fatPer100: 100,
        caloriesPer100: 1600,
        servingWeightG: 100,
      },
      runtime.db,
    );

    const entry = await createMealEntry(
      userId,
      {
        date: "2026-05-04",
        productId: legacyProduct.id,
        label: "Legacy oats",
        quantity: 1,
        unit: "serving",
        proteinG: 5,
        carbsG: 27,
        fatG: 3,
        caloriesKcal: 150,
      },
      runtime.db,
    );

    expect(entry).toMatchObject({
      productId: legacyProduct.id,
      proteinG: 5,
      carbsG: 27,
      fatG: 3,
      caloriesKcal: 150,
    });

    const updated = await updateMealEntry(
      userId,
      entry.id,
      {
        date: entry.date,
        productId: legacyProduct.id,
        label: "Legacy oats edited",
        sortOrder: entry.sortOrder,
        quantity: 1,
        unit: "serving",
        proteinG: 7,
        carbsG: 30,
        fatG: 4,
        caloriesKcal: 180,
      },
      runtime.db,
    );

    expect(updated).toMatchObject({
      productId: legacyProduct.id,
      label: "Legacy oats edited",
      proteinG: 7,
      carbsG: 30,
      fatG: 4,
      caloriesKcal: 180,
    });
  });

  it("seeds default meal groups idempotently across concurrent first requests", async () => {
    await Promise.all([
      ensureDefaultMealGroups(userId, runtime.db),
      ensureDefaultMealGroups(userId, runtime.db),
    ]);

    const groups = await getMealGroups(userId, runtime.db);
    expect(groups.map((group) => group.label)).toEqual([
      "Breakfast",
      "Lunch",
      "Dinner",
      "Snack",
    ]);
    expect(new Set(groups.map((group) => group.id)).size).toBe(4);
  });

  it("rolls back meal group deletion when unassigning entries fails", async () => {
    const group = await createMealGroup(userId, { label: "Supper" }, runtime.db);
    const entry = await createMealEntry(
      userId,
      {
        date: "2026-05-05",
        mealGroupId: group.id,
        label: "Salmon bowl",
        proteinG: 40,
        carbsG: 50,
        fatG: 18,
        caloriesKcal: 520,
      },
      runtime.db,
    );

    await expect(
      deleteMealGroup(userId, group.id, createFailingMealGroupDeleteDb()),
    ).rejects.toThrow("Forced meal group unassign failure.");

    const groups = await getMealGroups(userId, runtime.db);
    expect(groups.map((item) => item.id)).toContain(group.id);

    const summary = await getDailySummary(userId, "2026-05-05", runtime.db);
    expect(summary.meals.find((meal) => meal.id === entry.id)?.mealGroupId).toBe(
      group.id,
    );
  });

  it("returns the existing meal for concurrent creates with the same client mutation id", async () => {
    const input = {
      date: "2026-05-06",
      label: "Idempotent shake",
      proteinG: 30,
      carbsG: 20,
      fatG: 5,
      caloriesKcal: 245,
      clientMutationId: "meal-entry-concurrent-1",
    };

    const [first, second] = await Promise.all([
      createMealEntry(userId, input, runtime.db),
      createMealEntry(userId, input, runtime.db),
    ]);

    expect(second.id).toBe(first.id);
    const summary = await getDailySummary(userId, "2026-05-06", runtime.db);
    expect(
      summary.meals.filter(
        (meal) => meal.clientMutationId === "meal-entry-concurrent-1",
      ),
    ).toHaveLength(1);
  });

  it("creates searchable products and resolves quantity-scaled nutrition", async () => {
    const product = await createPersonalFoodProduct(
      userId,
      {
        name: "Greek yogurt 2%",
        source: "manual",
        defaultServingQuantity: 150,
        defaultServingUnit: "g",
        proteinPer100: 10,
        carbsPer100: 4,
        fatPer100: 2,
        caloriesPer100: 74,
      },
      runtime.db,
    );

    const results = await searchFoodProducts(userId, "greek", runtime.db);
    expect(results.map((item) => item.id)).toContain(product.id);
    expect(resolveProductNutritionForQuantity(product, 150, "g")).toEqual({
      proteinG: 15,
      carbsG: 6,
      fatG: 3,
      caloriesKcal: 111,
    });
  });

  it("forces user-created products to personal scope and validates product enums", async () => {
    const baseProduct = {
      name: "Shared almonds",
      source: "manual" as const,
      defaultServingQuantity: 100,
      defaultServingUnit: "g" as const,
      proteinPer100: 21,
      carbsPer100: 22,
      fatPer100: 49,
      caloriesPer100: 579,
    };
    const product = await createPersonalFoodProduct(
      userId,
      {
        ...baseProduct,
        scope: "global",
      },
      runtime.db,
    );

    expect(product.scope).toBe("personal");
    expect(product.ownerUserId).toBe(userId);

    const otherUserId = await createOtherUser();
    const otherResults = await searchFoodProducts(
      otherUserId,
      "shared almonds",
      runtime.db,
    );
    expect(otherResults.map((item) => item.id)).not.toContain(product.id);

    await expect(
      createPersonalFoodProduct(
        userId,
        { ...baseProduct, name: "Bad scope", scope: "shared" as never },
        runtime.db,
      ),
    ).rejects.toThrow("Product scope is invalid.");

    await expect(
      createPersonalFoodProduct(
        userId,
        { ...baseProduct, name: "Bad source", source: "feed" as never },
        runtime.db,
      ),
    ).rejects.toThrow("Product source is invalid.");
  });

  it("preserves recipe cooked weight and ingredient quantity metadata", async () => {
    const recipe = await createRecipe(
      userId,
      {
        label: "Rice pot",
        portions: 4,
        totalCookedWeightG: 900,
        ingredients: [
          {
            label: "Rice",
            quantity: 250,
            unit: "g",
            proteinG: 18,
            carbsG: 190,
            fatG: 2,
            caloriesKcal: 850,
          },
        ],
      },
      runtime.db,
    );

    expect(recipe.totalCookedWeightG).toBe(900);
    expect(recipe.ingredients[0]).toMatchObject({
      quantity: 250,
      unit: "g",
    });
  });

  it("computes streaks from local date strings", () => {
    expect(
      computeStreaks(
        ["2026-03-01", "2026-03-02", "2026-03-04", "2026-03-05", "2026-03-06"],
        "2026-03-07",
      ),
    ).toEqual({
      currentStreak: 3,
      longestStreak: 3,
    });

    expect(
      computeStreaks(
        ["2026-03-01", "2026-03-02", "2026-03-04", "2026-03-05", "2026-03-06"],
        "2026-03-06",
      ),
    ).toEqual({
      currentStreak: 3,
      longestStreak: 3,
    });
  });

  it("returns quick-add candidates with sourceDate, observedUseDays, and habit metadata", async () => {
    await createMealWithCreatedAt(
      {
        date: "2026-04-01",
        label: "Oats",
        proteinG: 5,
        carbsG: 27,
        fatG: 3,
        caloriesKcal: 150,
      },
      "2026-04-01T07:15:00.000Z",
    );
    await createMealWithCreatedAt(
      {
        date: "2026-04-03",
        label: "Oats",
        proteinG: 5,
        carbsG: 27,
        fatG: 3,
        caloriesKcal: 150,
      },
      "2026-04-03T07:30:00.000Z",
    );
    await createMealWithCreatedAt(
      {
        date: "2026-04-05",
        label: "Oats",
        proteinG: 5,
        carbsG: 27,
        fatG: 3,
        caloriesKcal: 150,
      },
      "2026-04-05T08:00:00.000Z",
    );

    const candidates = await getRecentQuickAddCandidates(userId, 10, runtime.db);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      label: "Oats",
      sourceDate: "2026-04-05",
      observedUseDays: 3,
      peakHourUtc: 7,
      habitCount: 3,
    });
  });

  it("counts distinct logged dates for observedUseDays", async () => {
    await createMealWithCreatedAt(
      {
        date: "2026-04-08",
        label: "Bagel",
        proteinG: 10,
        carbsG: 40,
        fatG: 4,
        caloriesKcal: 230,
      },
      "2026-04-08T07:10:00.000Z",
    );
    await createMealWithCreatedAt(
      {
        date: "2026-04-08",
        label: "Bagel",
        proteinG: 10,
        carbsG: 40,
        fatG: 4,
        caloriesKcal: 230,
      },
      "2026-04-08T07:40:00.000Z",
    );
    await createMealWithCreatedAt(
      {
        date: "2026-04-10",
        label: "Bagel",
        proteinG: 10,
        carbsG: 40,
        fatG: 4,
        caloriesKcal: 230,
      },
      "2026-04-10T07:25:00.000Z",
    );

    const candidates = await getRecentQuickAddCandidates(userId, 10, runtime.db);
    expect(candidates[0]).toMatchObject({
      label: "Bagel",
      sourceDate: "2026-04-10",
      observedUseDays: 2,
    });
  });

  it("only marks a habit once at least three logs share the same time bucket", async () => {
    await createMealWithCreatedAt(
      {
        date: "2026-04-11",
        label: "Toast",
        proteinG: 6,
        carbsG: 20,
        fatG: 2,
        caloriesKcal: 130,
      },
      "2026-04-11T07:00:00.000Z",
    );
    await createMealWithCreatedAt(
      {
        date: "2026-04-12",
        label: "Toast",
        proteinG: 6,
        carbsG: 20,
        fatG: 2,
        caloriesKcal: 130,
      },
      "2026-04-12T08:00:00.000Z",
    );

    let candidates = await getRecentQuickAddCandidates(userId, 10, runtime.db);
    expect(candidates[0]).toMatchObject({
      label: "Toast",
      observedUseDays: 2,
    });
    expect(candidates[0]?.peakHourUtc).toBeUndefined();
    expect(candidates[0]?.habitCount).toBeUndefined();

    await createMealWithCreatedAt(
      {
        date: "2026-04-13",
        label: "Toast",
        proteinG: 6,
        carbsG: 20,
        fatG: 2,
        caloriesKcal: 130,
      },
      "2026-04-13T07:20:00.000Z",
    );

    candidates = await getRecentQuickAddCandidates(userId, 10, runtime.db);
    expect(candidates[0]).toMatchObject({
      label: "Toast",
      observedUseDays: 3,
      peakHourUtc: 7,
      habitCount: 3,
    });
  });

  it("rolls back recipe creation if an ingredient insert fails mid-transaction", async () => {
    const failingDb = createFailingRecipeDb(2);

    await expect(
      createRecipe(
        userId,
        {
          label: "Failed Recipe",
          portions: 2,
          ingredients: [
            {
              label: "Chicken",
              proteinG: 30,
              carbsG: 0,
              fatG: 5,
              caloriesKcal: 170,
            },
            {
              label: "Rice",
              proteinG: 4,
              carbsG: 40,
              fatG: 1,
              caloriesKcal: 185,
            },
          ],
        },
        failingDb,
      ),
    ).rejects.toThrow("Forced ingredient insert failure.");

    const recipeRows = await runtime.db.select().from(recipes);
    const ingredientRows = await runtime.db.select().from(recipeIngredients);

    expect(recipeRows).toHaveLength(0);
    expect(ingredientRows).toHaveLength(0);
  });

  it("rolls back recipe updates when replacing ingredients fails mid-transaction", async () => {
    const original = await createRecipe(
      userId,
      {
        label: "Original Recipe",
        portions: 2,
        ingredients: [
          {
            label: "Eggs",
            proteinG: 12,
            carbsG: 1,
            fatG: 10,
            caloriesKcal: 140,
          },
          {
            label: "Toast",
            proteinG: 4,
            carbsG: 20,
            fatG: 2,
            caloriesKcal: 120,
          },
        ],
      },
      runtime.db,
    );
    const failingDb = createFailingRecipeDb(2);

    await expect(
      updateRecipe(
        userId,
        original.id,
        {
          label: "Updated Recipe",
          portions: 3,
          ingredients: [
            {
              label: "Yogurt",
              proteinG: 15,
              carbsG: 8,
              fatG: 0,
              caloriesKcal: 92,
            },
            {
              label: "Berries",
              proteinG: 1,
              carbsG: 12,
              fatG: 0,
              caloriesKcal: 49,
            },
          ],
        },
        failingDb,
      ),
    ).rejects.toThrow("Forced ingredient insert failure.");

    const stored = await getRecipeById(userId, original.id, runtime.db);

    expect(stored).toMatchObject({
      id: original.id,
      label: "Original Recipe",
      portions: 2,
    });
    expect(stored?.ingredients.map((ingredient) => ingredient.label)).toEqual([
      "Eggs",
      "Toast",
    ]);
  });
});
