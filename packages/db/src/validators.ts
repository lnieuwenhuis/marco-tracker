import {
  FOOD_PRODUCT_SCOPE_VALUES,
  FOOD_PRODUCT_SOURCE_VALUES,
  isMealEntryStatus,
  isQuantityUnit,
  type FoodProductInput,
  type FoodProductScope,
  type FoodProductSource,
  type MacroNumbers,
  type MealEntryInput,
  type QuantityUnit,
  type RecipeInput,
  type WeightEntryInput,
} from "./types";

export class MealEntryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MealEntryValidationError";
  }
}

function roundToSingleDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function normalizeFoodProductScope(value: unknown): FoodProductScope {
  const scope = value ?? "personal";
  if (
    typeof scope !== "string" ||
    !FOOD_PRODUCT_SCOPE_VALUES.includes(scope as FoodProductScope)
  ) {
    throw new MealEntryValidationError("Product scope is invalid.");
  }
  return scope as FoodProductScope;
}

function normalizeFoodProductSource(value: unknown): FoodProductSource {
  const source = value ?? "manual";
  if (
    typeof source !== "string" ||
    !FOOD_PRODUCT_SOURCE_VALUES.includes(source as FoodProductSource)
  ) {
    throw new MealEntryValidationError("Product source is invalid.");
  }
  return source as FoodProductSource;
}

export class WeightEntryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeightEntryValidationError";
  }
}

function assertFiniteNonNegative(value: number, fieldName: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new MealEntryValidationError(`${fieldName} must be a non-negative number.`);
  }
}

function assertInteger(value: number, fieldName: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new MealEntryValidationError(`${fieldName} must be a non-negative integer.`);
  }
}

function normalizePositiveNumber(
  value: number | null | undefined,
  fieldName: string,
  fallback: number,
) {
  if (value == null) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new MealEntryValidationError(`${fieldName} must be a positive number.`);
  }

  return Math.round(parsed * 100) / 100;
}

function normalizeQuantityUnit(value: string | undefined): QuantityUnit {
  if (!value) {
    return "serving";
  }

  if (!isQuantityUnit(value)) {
    throw new MealEntryValidationError("Quantity unit is invalid.");
  }

  return value;
}

export function normalizeMacroNumbers(input: MacroNumbers): MacroNumbers {
  assertFiniteNonNegative(input.proteinG, "Protein");
  assertFiniteNonNegative(input.carbsG, "Carbs");
  assertFiniteNonNegative(input.fatG, "Fat");
  assertFiniteNonNegative(input.caloriesKcal, "Calories");
  assertInteger(input.caloriesKcal, "Calories");

  return {
    proteinG: roundToSingleDecimal(input.proteinG),
    carbsG: roundToSingleDecimal(input.carbsG),
    fatG: roundToSingleDecimal(input.fatG),
    caloriesKcal: input.caloriesKcal,
  };
}

export function validateMealEntryInput(input: MealEntryInput): MealEntryInput {
  const label = input.label.trim();
  const sortOrder = Number(input.sortOrder);
  const status = input.status ?? "eaten";

  if (!label) {
    throw new MealEntryValidationError("Meal name is required.");
  }

  if (!isMealEntryStatus(status)) {
    throw new MealEntryValidationError("Meal status is invalid.");
  }

  assertInteger(sortOrder, "Sort order");

  const macros = normalizeMacroNumbers({
    proteinG: input.proteinG,
    carbsG: input.carbsG,
    fatG: input.fatG,
    caloriesKcal: input.caloriesKcal,
  });

  const hasAnyNutrition =
    macros.proteinG > 0 ||
    macros.carbsG > 0 ||
    macros.fatG > 0 ||
    macros.caloriesKcal > 0;

  if (!hasAnyNutrition) {
    throw new MealEntryValidationError(
      "At least one macro or calorie value must be greater than zero.",
    );
  }

  return {
    ...input,
    ...macros,
    label,
    sortOrder,
    status,
    mealGroupId: input.mealGroupId ?? null,
    productId: input.productId ?? null,
    quantity: normalizePositiveNumber(input.quantity, "Quantity", 1),
    unit: normalizeQuantityUnit(input.unit),
    servingMultiplier: normalizePositiveNumber(
      input.servingMultiplier,
      "Serving multiplier",
      1,
    ),
    clientMutationId: input.clientMutationId?.trim() || null,
  };
}

export class RecipeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecipeValidationError";
  }
}

export function validateRecipeInput(input: RecipeInput): RecipeInput {
  const label = input.label.trim();
  if (!label) {
    throw new RecipeValidationError("Recipe name is required.");
  }

  const portions = Math.round(input.portions);
  if (!Number.isFinite(portions) || portions < 1) {
    throw new RecipeValidationError("Portions must be at least 1.");
  }
  if (portions > 999) {
    throw new RecipeValidationError("Portions must be less than 1000.");
  }

  if (input.ingredients.length === 0) {
    throw new RecipeValidationError(
      "A recipe must have at least one ingredient.",
    );
  }

  let totalCookedWeightG = input.totalCookedWeightG ?? null;
  if (totalCookedWeightG != null) {
    totalCookedWeightG = Number(totalCookedWeightG);
    if (!Number.isFinite(totalCookedWeightG) || totalCookedWeightG <= 0) {
      throw new RecipeValidationError("Cooked weight must be a positive number.");
    }
    totalCookedWeightG = Math.round(totalCookedWeightG * 100) / 100;
  }

  const ingredients = input.ingredients.map((ing, i) => {
    const ingLabel = ing.label.trim();
    if (!ingLabel) {
      throw new RecipeValidationError(
        `Ingredient ${i + 1} name is required.`,
      );
    }
    const macros = normalizeMacroNumbers({
      proteinG: ing.proteinG,
      carbsG: ing.carbsG,
      fatG: ing.fatG,
      caloriesKcal: ing.caloriesKcal,
    });
    return {
      ...macros,
      productId: ing.productId ?? null,
      label: ingLabel,
      quantity: normalizePositiveNumber(ing.quantity, "Quantity", 1),
      unit: normalizeQuantityUnit(ing.unit),
      servingMultiplier: normalizePositiveNumber(
        ing.servingMultiplier,
        "Serving multiplier",
        1,
      ),
    };
  });

  return { label, portions, totalCookedWeightG, ingredients };
}

export function validateFoodProductInput(input: FoodProductInput): Required<
  Pick<
    FoodProductInput,
    | "name"
    | "defaultServingQuantity"
    | "defaultServingUnit"
    | "proteinPer100"
    | "carbsPer100"
    | "fatPer100"
    | "caloriesPer100"
  >
> &
  Omit<
    FoodProductInput,
    | "name"
    | "defaultServingQuantity"
    | "defaultServingUnit"
    | "proteinPer100"
    | "carbsPer100"
    | "fatPer100"
    | "caloriesPer100"
  > {
  const name = input.name.trim();
  if (!name) {
    throw new MealEntryValidationError("Product name is required.");
  }

  const macros = normalizeMacroNumbers({
    proteinG: input.proteinPer100,
    carbsG: input.carbsPer100,
    fatG: input.fatPer100,
    caloriesKcal: input.caloriesPer100,
  });

  const defaultServingUnit = normalizeQuantityUnit(input.defaultServingUnit);
  const defaultServingQuantity = normalizePositiveNumber(
    input.defaultServingQuantity,
    "Default serving quantity",
    1,
  );

  const servingWeightG =
    input.servingWeightG != null
      ? normalizePositiveNumber(input.servingWeightG, "Serving weight", 1)
      : null;
  const servingVolumeMl =
    input.servingVolumeMl != null
      ? normalizePositiveNumber(input.servingVolumeMl, "Serving volume", 1)
      : null;

  const scope = normalizeFoodProductScope(input.scope);
  const source = normalizeFoodProductSource(input.source);

  return {
    ...input,
    name,
    brand: input.brand?.trim() ?? "",
    barcode: input.barcode?.trim() || null,
    scope,
    source,
    defaultServingQuantity,
    defaultServingUnit,
    proteinPer100: macros.proteinG,
    carbsPer100: macros.carbsG,
    fatPer100: macros.fatG,
    caloriesPer100: macros.caloriesKcal,
    servingWeightG,
    servingVolumeMl,
  };
}

function roundToTwoDecimals(value: number) {
  return Math.round(value * 100) / 100;
}

export function validateWeightEntryInput(
  input: WeightEntryInput,
): WeightEntryInput {
  const weightKg = Number(input.weightKg);

  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    throw new WeightEntryValidationError(
      "Weight must be a positive number.",
    );
  }

  if (weightKg > 999.99) {
    throw new WeightEntryValidationError(
      "Weight must be less than 1000 kg.",
    );
  }

  let bodyFatPct = input.bodyFatPct;
  if (bodyFatPct != null) {
    bodyFatPct = Number(bodyFatPct);
    if (!Number.isFinite(bodyFatPct) || bodyFatPct < 0 || bodyFatPct > 100) {
      throw new WeightEntryValidationError(
        "Body fat percentage must be between 0 and 100.",
      );
    }
    bodyFatPct = roundToSingleDecimal(bodyFatPct);
  }

  const notes = input.notes?.trim() || null;

  return {
    date: input.date,
    weightKg: roundToTwoDecimals(weightKg),
    bodyFatPct: bodyFatPct ?? null,
    notes,
  };
}
