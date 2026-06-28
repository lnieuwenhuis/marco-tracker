"use client";

import { useId, useState } from "react";

import {
  ACTIVITY_LEVEL_OPTIONS,
  GOAL_PRESET_OPTIONS,
  calculateMacroTargets,
  getWeeklyWeightChangeEstimateKg,
  type ActivityLevelId,
  type GoalPresetId,
  type MacroCalculatorSex,
} from "@/lib/macro-calculator";

import { NumberInputField } from "./number-input-field";

export type MacroTargetDraft = {
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

type MacroCalculatorPanelProps = {
  disabled?: boolean;
  initialWeightKg?: number | null;
  applyLabel?: string;
  onApplyTargets: (targets: MacroTargetDraft) => void;
};

function toNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function formatMacroInputValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatSignedCalories(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value} kcal`;
}

function formatWeeklyChangeLabel(calorieAdjustmentKcal: number) {
  if (calorieAdjustmentKcal === 0) {
    return "weight stable";
  }

  const estimateKg = getWeeklyWeightChangeEstimateKg(calorieAdjustmentKcal);
  const direction = calorieAdjustmentKcal < 0 ? "loss" : "gain";
  return `${estimateKg} kg/week ${direction}`;
}

function ChoiceButton({
  label,
  detail,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  detail: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={[
        "rounded-2xl border px-4 py-3 text-left transition disabled:opacity-60",
        selected
          ? "border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_12%,var(--color-surface-strong))]"
          : "border-[var(--color-border)] bg-[var(--color-surface-strong)] hover:border-[var(--color-border-strong)]",
      ].join(" ")}
    >
      <span className="block text-sm font-bold text-[var(--color-ink)]">
        {label}
      </span>
      <span className="mt-1 block text-xs text-[var(--color-muted)]">
        {detail}
      </span>
    </button>
  );
}

function ResultTile({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-strong)]">
        {label}
      </span>
      <div className="mt-1.5 text-xl font-bold tabular-nums text-[var(--color-ink)]">
        {value}
      </div>
    </div>
  );
}

export function MacroCalculatorPanel({
  disabled = false,
  initialWeightKg = null,
  applyLabel = "Apply to targets",
  onApplyTargets,
}: MacroCalculatorPanelProps) {
  const titleId = useId();
  const [sex, setSex] = useState<MacroCalculatorSex>("male");
  const [age, setAge] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState(
    initialWeightKg != null ? formatMacroInputValue(initialWeightKg) : "",
  );
  const [activityLevel, setActivityLevel] =
    useState<ActivityLevelId>("moderate");
  const [goalPreset, setGoalPreset] = useState<GoalPresetId>("maintain");
  const [calculatorError, setCalculatorError] = useState<string | null>(null);

  const parsedAge = toNullableNumber(age);
  const parsedHeightCm = toNullableNumber(heightCm);
  const parsedWeightKg = toNullableNumber(weightKg);
  const selectedActivity = ACTIVITY_LEVEL_OPTIONS.find(
    (option) => option.id === activityLevel,
  );
  const calculatedTargets =
    parsedAge != null && parsedHeightCm != null && parsedWeightKg != null
      ? calculateMacroTargets({
          sex,
          age: parsedAge,
          heightCm: parsedHeightCm,
          weightKg: parsedWeightKg,
          activityLevel,
          goalPreset,
        })
      : null;

  function updateCalculator(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setCalculatorError(null);
    };
  }

  function handleApplyCalculatedTargets() {
    if (!calculatedTargets) {
      setCalculatorError("Age, height, and weight are required.");
      return;
    }

    onApplyTargets(calculatedTargets.macros);
    setCalculatorError(null);
  }

  return (
    <section
      aria-labelledby={titleId}
      className="space-y-4 rounded-[1.45rem] border border-[var(--color-border)] bg-[var(--color-shell-panel)] p-4 sm:p-5"
    >
      <div>
        <h3 id={titleId} className="text-sm font-bold text-[var(--color-ink)]">
          Macro calculator
        </h3>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Estimate daily calories, protein, carbs, and fat from body stats and goal pace.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3" role="group" aria-label="Sex">
        <ChoiceButton
          label="Male"
          detail="Mifflin-St Jeor"
          selected={sex === "male"}
          disabled={disabled}
          onClick={() => {
            setSex("male");
            setCalculatorError(null);
          }}
        />
        <ChoiceButton
          label="Female"
          detail="Mifflin-St Jeor"
          selected={sex === "female"}
          disabled={disabled}
          onClick={() => {
            setSex("female");
            setCalculatorError(null);
          }}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <NumberInputField
          label="Age"
          unit="yrs"
          step="1"
          value={age}
          disabled={disabled}
          variant="card"
          onChange={updateCalculator(setAge)}
        />
        <NumberInputField
          label="Height"
          unit="cm"
          step="0.1"
          value={heightCm}
          disabled={disabled}
          variant="card"
          onChange={updateCalculator(setHeightCm)}
        />
        <NumberInputField
          label="Weight"
          unit="kg"
          step="0.1"
          value={weightKg}
          disabled={disabled}
          variant="card"
          onChange={updateCalculator(setWeightKg)}
        />
      </div>

      <label className="block rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-strong)]">
          Activity
        </span>
        <select
          value={activityLevel}
          disabled={disabled}
          onChange={(event) => {
            setActivityLevel(event.target.value as ActivityLevelId);
            setCalculatorError(null);
          }}
          className="mt-2 w-full rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-card-muted)] px-3 py-3 text-base font-semibold text-[var(--color-ink)] outline-none transition focus:border-[var(--color-accent)] disabled:opacity-60"
        >
          {ACTIVITY_LEVEL_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="mt-2 block text-xs text-[var(--color-muted)]">
          {selectedActivity?.description}
        </span>
      </label>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-muted-strong)]">
            Goal pace
          </h4>
          <span className="text-[11px] text-[var(--color-muted)]">
            {GOAL_PRESET_OPTIONS.length} presets
          </span>
        </div>
        {GOAL_PRESET_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={goalPreset === option.id}
            onClick={() => {
              setGoalPreset(option.id);
              setCalculatorError(null);
            }}
            disabled={disabled}
            className={[
              "w-full rounded-2xl border px-4 py-3 text-left transition disabled:opacity-60",
              goalPreset === option.id
                ? "border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_12%,var(--color-surface-strong))]"
                : "border-[var(--color-border)] bg-[var(--color-surface-strong)] hover:border-[var(--color-border-strong)]",
            ].join(" ")}
          >
            <span className="flex items-center justify-between gap-4">
              <span className="min-w-0">
                <span className="block text-sm font-bold text-[var(--color-ink)]">
                  {option.label}
                </span>
                <span className="mt-1 block text-xs text-[var(--color-muted)]">
                  {option.description}
                </span>
                <span className="mt-1 block text-[11px] font-semibold text-[var(--color-muted-strong)]">
                  {formatWeeklyChangeLabel(option.calorieAdjustmentKcal)}
                </span>
              </span>
              <span className="shrink-0 text-xs font-bold text-[var(--color-muted-strong)]">
                {formatSignedCalories(option.calorieAdjustmentKcal)}
              </span>
            </span>
          </button>
        ))}
      </div>

      {calculatorError ? (
        <p className="text-sm text-[var(--color-danger)]">{calculatorError}</p>
      ) : null}

      <div className="rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
        {calculatedTargets ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <ResultTile label="BMR" value={`${calculatedTargets.bmrKcal} kcal`} />
              <ResultTile label="TDEE" value={`${calculatedTargets.tdeeKcal} kcal`} />
              <ResultTile
                label="Target"
                value={`${calculatedTargets.targetCaloriesKcal} kcal`}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <ResultTile
                label="Protein"
                value={`${formatMacroInputValue(calculatedTargets.macros.proteinG)} g`}
              />
              <ResultTile
                label="Carbs"
                value={`${formatMacroInputValue(calculatedTargets.macros.carbsG)} g`}
              />
              <ResultTile
                label="Fat"
                value={`${formatMacroInputValue(calculatedTargets.macros.fatG)} g`}
              />
              <ResultTile
                label="Calories"
                value={`${calculatedTargets.macros.caloriesKcal} kcal`}
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-[var(--color-muted)]">
                Protein: {calculatedTargets.proteinTargetGPerKg} g/kg from{" "}
                {formatMacroInputValue(calculatedTargets.proteinReferenceWeightKg)} kg{" "}
                {calculatedTargets.proteinReferenceType} weight.
              </p>
              <button
                type="button"
                onClick={handleApplyCalculatedTargets}
                disabled={disabled}
                className="rounded-xl bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70"
              >
                {applyLabel}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-muted)]">
            Age, height, and weight are required.
          </p>
        )}
      </div>
    </section>
  );
}
