import type { MealEntryRecord } from "@macro-tracker/db";

export type CopyMealEntryToDateInput = {
  date: string;
  mealGroupId: string | null;
  status: "eaten";
  productId: string | null;
  label: string;
  quantity: number;
  unit: MealEntryRecord["unit"];
  servingMultiplier: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  caloriesKcal: number;
};

export function buildMealEntryCopyInput(
  entry: MealEntryRecord,
  date: string,
): CopyMealEntryToDateInput {
  return {
    date,
    mealGroupId: entry.mealGroupId,
    status: "eaten",
    productId: entry.productId,
    label: entry.label,
    quantity: entry.quantity,
    unit: entry.unit,
    servingMultiplier: entry.servingMultiplier,
    proteinG: entry.proteinG,
    carbsG: entry.carbsG,
    fatG: entry.fatG,
    caloriesKcal: entry.caloriesKcal,
  };
}
