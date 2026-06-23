import type { MealTemplate, MealTemplateItem } from "@macro-tracker/db";

export type TemplateMacroTotals = {
  proteinG: number;
  carbsG: number;
  fatG: number;
  caloriesKcal: number;
};

function roundToSingleDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

export function getTemplateMacroTotals(
  items: Pick<
    MealTemplateItem,
    "proteinG" | "carbsG" | "fatG" | "caloriesKcal"
  >[],
): TemplateMacroTotals {
  return items.reduce<TemplateMacroTotals>(
    (totals, item) => ({
      proteinG: roundToSingleDecimal(totals.proteinG + item.proteinG),
      carbsG: roundToSingleDecimal(totals.carbsG + item.carbsG),
      fatG: roundToSingleDecimal(totals.fatG + item.fatG),
      caloriesKcal: totals.caloriesKcal + item.caloriesKcal,
    }),
    {
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      caloriesKcal: 0,
    },
  );
}

export function canEditAsSingleFoodTemplate(template: MealTemplate) {
  return template.type === "meal" && template.items.length === 1;
}

export function isFoodItemTemplate(template: MealTemplate) {
  return template.type === "meal";
}

export function isDayTemplate(template: MealTemplate) {
  return template.type === "day";
}
