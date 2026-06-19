import { describe, expect, it } from "vitest";

import type { MealEntryRecord } from "@macro-tracker/db";

import { buildMealEntryCopyInput } from "@/lib/meal-entry-copy";

function buildEntry(overrides: Partial<MealEntryRecord> = {}): MealEntryRecord {
  return {
    id: "entry-1",
    userId: "user-1",
    date: "2026-06-18",
    mealGroupId: "group-1",
    status: "planned",
    productId: "product-1",
    label: "Greek yogurt",
    sortOrder: 3,
    quantity: 150,
    unit: "g",
    servingMultiplier: 1.5,
    proteinG: 18,
    carbsG: 9,
    fatG: 3,
    caloriesKcal: 135,
    clientMutationId: null,
    sourceLabel: null,
    ...overrides,
  };
}

describe("buildMealEntryCopyInput", () => {
  it("preserves product-backed metadata while copying the entry as eaten on the target date", () => {
    const entry = buildEntry();

    expect(buildMealEntryCopyInput(entry, "2026-06-19")).toEqual({
      date: "2026-06-19",
      mealGroupId: "group-1",
      status: "eaten",
      productId: "product-1",
      label: "Greek yogurt",
      quantity: 150,
      unit: "g",
      servingMultiplier: 1.5,
      proteinG: 18,
      carbsG: 9,
      fatG: 3,
      caloriesKcal: 135,
    });
  });
});
