import type { MealTemplate } from "@macro-tracker/db";
import { describe, expect, it } from "vitest";

import {
  canEditAsSingleFoodTemplate,
  getTemplateMacroTotals,
} from "@/lib/template-macros";

function buildTemplate(
  type: MealTemplate["type"],
  itemCount: number,
): MealTemplate {
  return {
    id: `template-${type}-${itemCount}`,
    userId: "user-1",
    type,
    label: "Template",
    notes: null,
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    items: Array.from({ length: itemCount }, (_, index) => ({
      id: `item-${index}`,
      templateId: `template-${type}-${itemCount}`,
      productId: null,
      mealGroupLabel: null,
      sortOrder: index,
      label: `Item ${index + 1}`,
      quantity: 1,
      unit: "serving",
      servingMultiplier: 1,
      proteinG: 10 + index,
      carbsG: 20 + index,
      fatG: 5 + index,
      caloriesKcal: 200 + index,
    })),
  };
}

describe("template macro helpers", () => {
  it("aggregates macros across every template item", () => {
    const template = buildTemplate("day", 2);

    expect(getTemplateMacroTotals(template.items)).toEqual({
      proteinG: 21,
      carbsG: 41,
      fatG: 11,
      caloriesKcal: 401,
    });
  });

  it("only allows the single-food editor for one-item meal templates", () => {
    expect(canEditAsSingleFoodTemplate(buildTemplate("meal", 1))).toBe(true);
    expect(canEditAsSingleFoodTemplate(buildTemplate("meal", 2))).toBe(false);
    expect(canEditAsSingleFoodTemplate(buildTemplate("day", 1))).toBe(false);
  });
});
