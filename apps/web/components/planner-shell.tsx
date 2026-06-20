"use client";

import type { DailySummary, MealTemplate } from "@macro-tracker/db";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  applyTemplateAction,
  createTemplateFromDateAction,
} from "@/lib/actions";
import {
  getDailyMutationCacheKeys,
  getTemplateMutationCacheKeys,
} from "@/lib/app-warmup";

import { invalidateAppDataCache } from "./app-data-cache";
import { ExperimentalAppShell, ExperimentalSettingsButton } from "./experimental-app-shell";

type PlannerShellProps = {
  userEmail: string;
  canAccessAdmin: boolean;
  selectedDate: string;
  templates: MealTemplate[];
  dailySummary: DailySummary;
};

function templateTotals(template: MealTemplate) {
  return template.items.reduce(
    (totals, item) => ({
      proteinG: Math.round((totals.proteinG + item.proteinG) * 10) / 10,
      carbsG: Math.round((totals.carbsG + item.carbsG) * 10) / 10,
      fatG: Math.round((totals.fatG + item.fatG) * 10) / 10,
      caloriesKcal: totals.caloriesKcal + item.caloriesKcal,
    }),
    { proteinG: 0, carbsG: 0, fatG: 0, caloriesKcal: 0 },
  );
}

export function PlannerShell({
  userEmail,
  canAccessAdmin,
  selectedDate,
  templates,
  dailySummary,
}: PlannerShellProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [templateLabel, setTemplateLabel] = useState("");

  function applyTemplate(templateId: string) {
    setError(null);
    startTransition(async () => {
      const result = await applyTemplateAction({
        templateId,
        date: selectedDate,
        status: "planned",
      });

      if (!result.ok) {
        setError(result.error ?? "Unable to apply template.");
        return;
      }

      invalidateAppDataCache(getDailyMutationCacheKeys(selectedDate));
      router.refresh();
    });
  }

  function saveDateAsTemplate() {
    const label = templateLabel.trim();
    if (!label) {
      setError("Template name is required.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await createTemplateFromDateAction({
        date: selectedDate,
        type: "day",
        label,
      });

      if (!result.ok) {
        setError(result.error ?? "Unable to create template.");
        return;
      }

      setTemplateLabel("");
      invalidateAppDataCache(getTemplateMutationCacheKeys());
      router.refresh();
    });
  }

  return (
    <ExperimentalAppShell
      userEmail={userEmail}
      canAccessAdmin={canAccessAdmin}
      selectedDate={selectedDate}
      title="Planner"
      activeTab="recipes"
      topBar={({ openSettings }) => (
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-muted-strong)]">
              Meal Planner
            </h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Apply templates as planned entries for the selected day.
            </p>
          </div>
          <ExperimentalSettingsButton onClick={openSettings} />
        </div>
      )}
    >
      <div className="space-y-5">
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[var(--color-ink)]">Selected day</h3>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                {dailySummary.meals.length} entries, {dailySummary.plannedTotals.caloriesKcal} planned kcal
              </p>
            </div>
            <a
              href={`/?date=${selectedDate}`}
              className="rounded-xl border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-ink)] transition hover:bg-[var(--color-card-muted)]"
            >
              Open log
            </a>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-5">
          <h3 className="text-sm font-bold text-[var(--color-ink)]">Save this day</h3>
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={templateLabel}
              onChange={(event) => setTemplateLabel(event.target.value)}
              placeholder="Template name"
              className="min-w-0 flex-1 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-card-muted)] px-3 py-2.5 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
            />
            <button
              type="button"
              disabled={isPending || dailySummary.meals.length === 0}
              onClick={saveDateAsTemplate}
              className="rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </section>

        {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}

        <section>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-muted-strong)]">
            Templates
          </h3>
          {templates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-shell-panel)] px-5 py-8 text-center">
              <p className="text-sm text-[var(--color-muted)]">No templates yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map((template) => {
                const totals = templateTotals(template);
                return (
                  <article
                    key={template.id}
                    className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-semibold text-[var(--color-ink)]">{template.label}</h4>
                        <p className="mt-1 text-xs text-[var(--color-muted)]">
                          {template.items.length} item{template.items.length === 1 ? "" : "s"} · {totals.caloriesKcal} kcal
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => applyTemplate(template.id)}
                        className="rounded-xl bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Apply
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </ExperimentalAppShell>
  );
}
