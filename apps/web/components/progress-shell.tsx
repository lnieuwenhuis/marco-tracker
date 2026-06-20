"use client";

import type { MacroGoals, WeightPageData } from "@macro-tracker/db";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  deleteWeightEntryAction,
  saveGoalsAction,
  saveWeightEntryAction,
  saveWeightGoalAction,
} from "@/lib/actions";
import {
  getGoalsMutationCacheKeys,
  getWeightMutationCacheKeys,
} from "@/lib/app-warmup";
import { formatShortDate } from "@/lib/formatting";
import type { ProgressTab } from "@/lib/ui-mode";

import { invalidateAppDataCache } from "./app-data-cache";
import { ConfirmDeleteButton } from "./confirm-delete-button";
import { ExperimentalAppShell, ExperimentalSettingsButton } from "./experimental-app-shell";

type ProgressShellProps = {
  userEmail: string;
  canAccessAdmin: boolean;
  selectedDate: string;
  goals: MacroGoals;
  weightData: WeightPageData;
  initialTab: ProgressTab;
};

function toNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function NumberField({
  label,
  value,
  unit,
  step,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  unit: string;
  step: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-strong)]">
        {label}
      </span>
      <div className="relative mt-2">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step={step}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-card-muted)] px-3 py-3 pr-12 text-base font-semibold text-[var(--color-ink)] outline-none transition focus:border-[var(--color-accent)] disabled:opacity-60"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[var(--color-muted)]">
          {unit}
        </span>
      </div>
    </label>
  );
}

function GoalsPanel({
  goals,
  selectedDate,
}: {
  goals: MacroGoals;
  selectedDate: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calories, setCalories] = useState(
    goals.caloriesKcal != null ? String(goals.caloriesKcal) : "",
  );
  const [protein, setProtein] = useState(
    goals.proteinG != null ? String(goals.proteinG) : "",
  );
  const [carbs, setCarbs] = useState(
    goals.carbsG != null ? String(goals.carbsG) : "",
  );
  const [fat, setFat] = useState(
    goals.fatG != null ? String(goals.fatG) : "",
  );

  function update(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setSaved(false);
      setError(null);
    };
  }

  function handleSave() {
    startTransition(async () => {
      const result = await saveGoalsAction({
        caloriesKcal: toNullableNumber(calories),
        proteinG: toNullableNumber(protein),
        carbsG: toNullableNumber(carbs),
        fatG: toNullableNumber(fat),
      });

      if (!result.ok) {
        setError(result.error ?? "Unable to save goals.");
        return;
      }

      setSaved(true);
      invalidateAppDataCache(getGoalsMutationCacheKeys(selectedDate));
      router.refresh();
    });
  }

  function handleClear() {
    setCalories("");
    setProtein("");
    setCarbs("");
    setFat("");
    setSaved(false);
    setError(null);
  }

  return (
    <div className="space-y-5">
      <section>
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-muted-strong)]">
          Daily Goals
        </h2>
        <p className="mt-1.5 text-sm text-[var(--color-muted)]">
          Set the targets used across your log, progress bars, and summary.
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <NumberField label="Calories" unit="kcal" step="1" value={calories} disabled={isPending} onChange={update(setCalories)} />
        <NumberField label="Protein" unit="g" step="0.1" value={protein} disabled={isPending} onChange={update(setProtein)} />
        <NumberField label="Carbs" unit="g" step="0.1" value={carbs} disabled={isPending} onChange={update(setCarbs)} />
        <NumberField label="Fat" unit="g" step="0.1" value={fat} disabled={isPending} onChange={update(setFat)} />
      </div>

      {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}

      <div className="flex gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={handleSave}
          className="flex-1 rounded-xl bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70"
        >
          {isPending ? "Saving..." : saved ? "Saved!" : "Save goals"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={handleClear}
          className="rounded-xl border border-[var(--color-border-strong)] px-4 py-3 text-sm font-semibold text-[var(--color-muted-strong)] transition hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] disabled:opacity-50"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

function WeightPanel({
  selectedDate,
  weightData,
}: {
  selectedDate: string;
  weightData: WeightPageData;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formDate, setFormDate] = useState(selectedDate);
  const [weightKg, setWeightKg] = useState("");
  const [bodyFatPct, setBodyFatPct] = useState("");
  const [notes, setNotes] = useState("");
  const [goalWeightKg, setGoalWeightKg] = useState(
    weightData.goalWeightKg != null ? String(weightData.goalWeightKg) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [goalSaved, setGoalSaved] = useState(false);

  useEffect(() => {
    setFormDate(selectedDate);
  }, [selectedDate]);

  function handleSaveEntry() {
    const parsedWeight = Number(weightKg);
    const parsedBodyFat = bodyFatPct.trim() ? Number(bodyFatPct) : null;

    if (!Number.isFinite(parsedWeight) || parsedWeight <= 0) {
      setError("Enter a valid weight.");
      return;
    }
    if (
      parsedBodyFat != null &&
      (!Number.isFinite(parsedBodyFat) || parsedBodyFat < 0 || parsedBodyFat > 100)
    ) {
      setError("Body fat must be between 0 and 100.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await saveWeightEntryAction({
        date: formDate,
        weightKg: parsedWeight,
        bodyFatPct: parsedBodyFat,
        notes: notes.trim() || null,
      });

      if (!result.ok) {
        setError(result.error ?? "Unable to save weight.");
        return;
      }

      setWeightKg("");
      setBodyFatPct("");
      setNotes("");
      invalidateAppDataCache(getWeightMutationCacheKeys(formDate));
      router.refresh();
    });
  }

  function handleSaveGoal() {
    const parsedGoal = goalWeightKg.trim() ? Number(goalWeightKg) : null;
    if (parsedGoal != null && (!Number.isFinite(parsedGoal) || parsedGoal <= 0)) {
      setError("Enter a valid goal weight.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await saveWeightGoalAction({ goalWeightKg: parsedGoal });
      if (!result.ok) {
        setError(result.error ?? "Unable to save goal weight.");
        return;
      }
      setGoalSaved(true);
      invalidateAppDataCache(getWeightMutationCacheKeys(selectedDate));
      router.refresh();
    });
  }

  function handleDeleteEntry(entryId: string, entryDate: string) {
    startTransition(async () => {
      const result = await deleteWeightEntryAction({ id: entryId });
      if (!result.ok) {
        setError(result.error ?? "Unable to delete entry.");
        return;
      }
      invalidateAppDataCache(getWeightMutationCacheKeys(entryDate));
      router.refresh();
    });
  }

  const { stats, entries } = weightData;

  return (
    <div className="space-y-5">
      <section>
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-muted-strong)]">
          Log Weight
        </h2>
        <p className="mt-1.5 text-sm text-[var(--color-muted)]">
          Track body-weight changes against your goal.
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted-strong)]">Current</p>
          <p className="mt-1.5 text-2xl font-bold text-[var(--color-ink)]">
            {stats.currentWeight != null ? `${stats.currentWeight} kg` : "-"}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted-strong)]">30-day</p>
          <p className="mt-1.5 text-2xl font-bold text-[var(--color-ink)]">
            {stats.monthChange != null ? `${stats.monthChange > 0 ? "+" : ""}${stats.monthChange.toFixed(1)} kg` : "-"}
          </p>
        </div>
      </div>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="mb-1 block text-xs text-[var(--color-muted)]">Date</span>
            <input
              type="date"
              value={formDate}
              onChange={(event) => setFormDate(event.target.value)}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-app-bg)] px-3 py-2.5 text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-accent)]"
            />
          </label>
          <label>
            <span className="mb-1 block text-xs text-[var(--color-muted)]">Weight (kg)</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={weightKg}
              onChange={(event) => setWeightKg(event.target.value)}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-app-bg)] px-3 py-2.5 text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-accent)]"
            />
          </label>
          <label>
            <span className="mb-1 block text-xs text-[var(--color-muted)]">Body fat %</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={bodyFatPct}
              onChange={(event) => setBodyFatPct(event.target.value)}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-app-bg)] px-3 py-2.5 text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-accent)]"
            />
          </label>
          <label>
            <span className="mb-1 block text-xs text-[var(--color-muted)]">Notes</span>
            <input
              type="text"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-app-bg)] px-3 py-2.5 text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-accent)]"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={handleSaveEntry}
          className="mt-4 w-full rounded-xl bg-[var(--color-accent)] py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:opacity-50"
        >
          Save entry
        </button>
      </section>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-5">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-muted-strong)]">
          Goal Weight
        </h3>
        <div className="flex items-end gap-3">
          <label className="flex-1">
            <span className="mb-1 block text-xs text-[var(--color-muted)]">Target (kg)</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={goalWeightKg}
              onChange={(event) => {
                setGoalWeightKg(event.target.value);
                setGoalSaved(false);
              }}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-app-bg)] px-3 py-2.5 text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-accent)]"
            />
          </label>
          <button
            type="button"
            disabled={isPending}
            onClick={handleSaveGoal}
            className="rounded-xl bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:opacity-50"
          >
            {goalSaved ? "Saved!" : "Save"}
          </button>
        </div>
      </section>

      {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}

      <section>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-muted-strong)]">
          History
        </h3>
        {entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-shell-panel)] px-5 py-8 text-center">
            <p className="text-sm text-[var(--color-muted)]">No weight entries yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {[...entries].reverse().map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--color-ink)]">{entry.weightKg} kg</p>
                  <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                    {formatShortDate(entry.date)}
                    {entry.bodyFatPct != null ? ` - ${entry.bodyFatPct}% bf` : ""}
                  </p>
                </div>
                <ConfirmDeleteButton
                  disabled={isPending}
                  onConfirm={() => handleDeleteEntry(entry.id, entry.date)}
                  ariaLabel="Delete entry"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:text-[var(--color-danger)]"
                >
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                    <line x1="3" y1="3" x2="12" y2="12" />
                    <line x1="12" y1="3" x2="3" y2="12" />
                  </svg>
                </ConfirmDeleteButton>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function ProgressShell({
  userEmail,
  canAccessAdmin,
  selectedDate,
  goals,
  weightData,
  initialTab,
}: ProgressShellProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ProgressTab>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  function handleTabChange(nextTab: ProgressTab) {
    setActiveTab(nextTab);
    router.replace(`/progress?date=${selectedDate}&tab=${nextTab}`, {
      scroll: false,
    });
  }

  return (
    <ExperimentalAppShell
      userEmail={userEmail}
      canAccessAdmin={canAccessAdmin}
      selectedDate={selectedDate}
      title="Goals & Weight"
      activeTab="progress"
      topBar={({ openSettings }) => (
        <div className="mb-4 flex items-center gap-3">
          <section className="flex-1 rounded-[1.45rem] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface-strong)_92%,transparent)] p-1 shadow-[0_16px_30px_rgba(0,0,0,0.12)] backdrop-blur-xl">
            <div
              role="tablist"
              aria-label="Progress views"
              className="grid h-12 grid-cols-2 gap-2"
            >
              {([
                { id: "goals", label: "Goals" },
                { id: "weight", label: "Weight" },
              ] as const).map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => handleTabChange(tab.id)}
                    className={[
                      "h-full rounded-[1.05rem] px-4 text-sm font-semibold transition",
                      isActive
                        ? "bg-[var(--color-accent)] text-white shadow-[0_10px_24px_rgba(0,0,0,0.14)]"
                        : "text-[var(--color-muted-strong)] hover:bg-[var(--color-card-muted)]",
                    ].join(" ")}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </section>
          <ExperimentalSettingsButton onClick={openSettings} />
        </div>
      )}
    >
      {activeTab === "goals" ? (
        <GoalsPanel goals={goals} selectedDate={selectedDate} />
      ) : (
        <WeightPanel selectedDate={selectedDate} weightData={weightData} />
      )}
    </ExperimentalAppShell>
  );
}
