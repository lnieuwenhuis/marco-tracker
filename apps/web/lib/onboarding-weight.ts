import type { WeightUnit } from "@macro-tracker/db";

const POUNDS_PER_KG = 2.2046226218;

function roundToTwoDecimals(value: number) {
  return Math.round(value * 100) / 100;
}

export function parsePositiveNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function normalizeOnboardingWeightKg(
  value: string,
  unit: WeightUnit,
): number | null {
  const parsed = parsePositiveNumber(value);
  if (parsed == null) {
    return null;
  }

  return unit === "lb" ? roundToTwoDecimals(parsed / POUNDS_PER_KG) : parsed;
}
