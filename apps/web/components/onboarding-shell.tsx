"use client";

import type { WeightUnit } from "@macro-tracker/db";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { completeOnboardingAction } from "@/lib/actions";
import {
  normalizeOnboardingWeightKg,
  parsePositiveNumber,
} from "@/lib/onboarding-weight";

import {
  MacroCalculatorPanel,
  formatMacroInputValue,
  type MacroTargetDraft,
} from "./macro-calculator-panel";
import { ThemePicker } from "./theme-toggle";

type OnboardingShellProps = {
  userEmail: string;
  currentDate: string;
  preferredWeightUnit: WeightUnit;
};

function MacroInput({
  label,
  value,
  unit,
  onChange,
}: {
  label: string;
  value: string;
  unit: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-strong)]">
        {label}
      </span>
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step={unit === "kcal" ? "1" : "0.1"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-card-muted)] px-3 py-2.5 pr-14 text-sm font-semibold text-[var(--color-ink)] outline-none transition focus:border-[var(--color-accent)]"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--color-muted)]">
          {unit}
        </span>
      </div>
    </label>
  );
}

export function OnboardingShell({
  userEmail,
  currentDate,
  preferredWeightUnit,
}: OnboardingShellProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [unit, setUnit] = useState<WeightUnit>(preferredWeightUnit);
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [goalWeight, setGoalWeight] = useState("");
  const [currentWeight, setCurrentWeight] = useState("");
  const [templateLabel, setTemplateLabel] = useState("");
  const [templateProtein, setTemplateProtein] = useState("");
  const [templateCarbs, setTemplateCarbs] = useState("");
  const [templateFat, setTemplateFat] = useState("");
  const [templateCalories, setTemplateCalories] = useState("");
  const [error, setError] = useState<string | null>(null);

  function applyCalculatedTargets(targets: MacroTargetDraft) {
    setCalories(String(targets.caloriesKcal));
    setProtein(formatMacroInputValue(targets.proteinG));
    setCarbs(formatMacroInputValue(targets.carbsG));
    setFat(formatMacroInputValue(targets.fatG));
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const starterTemplate = templateLabel.trim()
        ? {
            label: templateLabel.trim(),
            proteinG: Number(templateProtein) || 0,
            carbsG: Number(templateCarbs) || 0,
            fatG: Number(templateFat) || 0,
            caloriesKcal: Math.round(Number(templateCalories) || 0),
          }
        : null;

      const result = await completeOnboardingAction({
        preferredWeightUnit: unit,
        goals: {
          caloriesKcal: parsePositiveNumber(calories),
          proteinG: parsePositiveNumber(protein),
          carbsG: parsePositiveNumber(carbs),
          fatG: parsePositiveNumber(fat),
        },
        goalWeightKg: normalizeOnboardingWeightKg(goalWeight, unit),
        currentWeightKg: normalizeOnboardingWeightKg(currentWeight, unit),
        currentWeightDate: currentDate,
        starterTemplate,
      });

      if (!result.ok) {
        setError(result.error ?? "Unable to finish setup.");
        return;
      }

      router.replace("/");
      router.refresh();
    });
  }

  return (
    <main className="min-h-screen bg-[var(--color-app-bg)] px-4 py-[calc(1rem+env(safe-area-inset-top))] text-[var(--color-ink)]">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col justify-center">
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--color-muted-strong)]">
            Macro Tracker
          </p>
          <h1 className="mt-2 font-serif text-4xl">Set up your tracker</h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">{userEmail}</p>
        </div>

        <div className="space-y-4">
          <MacroCalculatorPanel
            disabled={isPending}
            applyLabel="Apply to daily goals"
            onApplyTargets={applyCalculatedTargets}
          />

          <section className="rounded-[1.75rem] border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-5">
            <h2 className="text-sm font-bold text-[var(--color-ink)]">Daily goals</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <MacroInput label="Calories" unit="kcal" value={calories} onChange={setCalories} />
              <MacroInput label="Protein" unit="g" value={protein} onChange={setProtein} />
              <MacroInput label="Carbs" unit="g" value={carbs} onChange={setCarbs} />
              <MacroInput label="Fat" unit="g" value={fat} onChange={setFat} />
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-5">
            <h2 className="text-sm font-bold text-[var(--color-ink)]">Weight</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <label>
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-strong)]">
                  Unit
                </span>
                <select
                  value={unit}
                  onChange={(event) => setUnit(event.target.value as WeightUnit)}
                  className="w-full rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-card-muted)] px-3 py-2.5 text-sm font-semibold text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
                >
                  <option value="kg">kg</option>
                  <option value="lb">lb</option>
                </select>
              </label>
              <MacroInput label="Current" unit={unit} value={currentWeight} onChange={setCurrentWeight} />
              <MacroInput label="Goal" unit={unit} value={goalWeight} onChange={setGoalWeight} />
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-5">
            <h2 className="text-sm font-bold text-[var(--color-ink)]">Starter template</h2>
            <input
              type="text"
              value={templateLabel}
              onChange={(event) => setTemplateLabel(event.target.value)}
              placeholder="Optional favorite food"
              className="mt-4 w-full rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-card-muted)] px-3 py-2.5 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <MacroInput label="Protein" unit="g" value={templateProtein} onChange={setTemplateProtein} />
              <MacroInput label="Carbs" unit="g" value={templateCarbs} onChange={setTemplateCarbs} />
              <MacroInput label="Fat" unit="g" value={templateFat} onChange={setTemplateFat} />
              <MacroInput label="Calories" unit="kcal" value={templateCalories} onChange={setTemplateCalories} />
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-5">
            <h2 className="mb-4 text-sm font-bold text-[var(--color-ink)]">Theme</h2>
            <ThemePicker />
          </section>
        </div>

        {error ? <p className="mt-4 text-sm text-[var(--color-danger)]">{error}</p> : null}

        <button
          type="button"
          disabled={isPending}
          onClick={submit}
          className="mt-5 rounded-2xl bg-[var(--color-accent)] px-5 py-4 text-sm font-bold text-white transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70"
        >
          {isPending ? "Saving..." : "Start tracking"}
        </button>
      </div>
    </main>
  );
}
