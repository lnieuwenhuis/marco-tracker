"use client";

import type { DailySummary, MealTemplate } from "@macro-tracker/db";
import { useRouter } from "next/navigation";
import { useDeferredValue, useMemo, useState, useTransition } from "react";

import {
  applyTemplateAction,
  createTemplateFromDateAction,
} from "@/lib/actions";
import {
  getDailyMutationCacheKeys,
  getTemplateMutationCacheKeys,
} from "@/lib/app-warmup";
import {
  getTemplateMacroTotals,
  isDayTemplate,
  isFoodItemTemplate,
} from "@/lib/template-macros";

import { invalidateAppDataCache } from "./app-data-cache";
import { ExperimentalAppShell, ExperimentalSettingsButton } from "./experimental-app-shell";
import { LibraryHubNav } from "./library-hub-nav";
import { TransitionLink } from "./transition-link";

type PlannerShellProps = {
  userEmail: string;
  canAccessAdmin: boolean;
  selectedDate: string;
  templates: MealTemplate[];
  recipeCount: number;
  dailySummary: DailySummary;
};

export function PlannerShell({
  userEmail,
  canAccessAdmin,
  selectedDate,
  templates,
  recipeCount,
  dailySummary,
}: PlannerShellProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [templateLabel, setTemplateLabel] = useState("");
  const [templateSearch, setTemplateSearch] = useState("");
  const deferredTemplateSearch = useDeferredValue(templateSearch);
  const normalizedTemplateSearch = deferredTemplateSearch.trim().toLowerCase();
  const foodItemTemplates = useMemo(
    () => templates.filter(isFoodItemTemplate),
    [templates],
  );
  const dayTemplates = useMemo(
    () => templates.filter(isDayTemplate),
    [templates],
  );
  const visibleDayTemplates = useMemo(
    () =>
      normalizedTemplateSearch
        ? dayTemplates.filter((template) =>
            template.label.toLowerCase().includes(normalizedTemplateSearch),
          )
        : dayTemplates,
    [dayTemplates, normalizedTemplateSearch],
  );
  const selectedDaySummary = `${dailySummary.meals.length} entries, ${dailySummary.plannedTotals.caloriesKcal} planned kcal`;
  const templateTiles = [
    {
      label: "Food items",
      count: foodItemTemplates.length,
      href: `/?date=${selectedDate}&compose=template&templateKind=food`,
      active: false,
    },
    {
      label: "Recipes",
      count: recipeCount,
      href: `/recipes?date=${selectedDate}`,
      active: false,
    },
    {
      label: "Days",
      count: dayTemplates.length,
      href: `/planner?date=${selectedDate}`,
      active: true,
    },
  ];

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
        <LibraryHubNav active="planner" selectedDate={selectedDate} />

        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-5">
          <h3 className="text-sm font-bold text-[var(--color-ink)]">Save currently selected day</h3>
          <p className="mt-1 text-xs text-[var(--color-muted)]">{selectedDaySummary}</p>
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
          <div className="mb-3 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-muted-strong)]">
              Templates
            </h3>
            <div className="grid gap-2 sm:grid-cols-3">
              {templateTiles.map((tile) => (
                <TransitionLink
                  key={tile.label}
                  href={tile.href}
                  motion="screen"
                  aria-current={tile.active ? "page" : undefined}
                  className={[
                    "rounded-2xl border px-4 py-3 transition hover:-translate-y-0.5",
                    tile.active
                      ? "border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_13%,var(--color-surface-strong))] text-[var(--color-accent)] shadow-sm"
                      : "border-[var(--color-border)] bg-[var(--color-surface-strong)] text-[var(--color-ink)] hover:bg-[var(--color-card-muted)]",
                  ].join(" ")}
                >
                  <span className="block text-sm font-bold">{tile.label}</span>
                  <span
                    className={[
                      "mt-1 block text-xs",
                      tile.active ? "text-[var(--color-accent)]" : "text-[var(--color-muted)]",
                    ].join(" ")}
                  >
                    {tile.count} saved
                  </span>
                </TransitionLink>
              ))}
            </div>
            <h4 className="pt-1 text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-muted-strong)]">
              Day templates
            </h4>
            {dayTemplates.length > 0 ? (
              <input
                type="search"
                value={templateSearch}
                onChange={(event) => setTemplateSearch(event.target.value)}
                placeholder="Search day templates"
                className="w-full rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-card-muted)] px-3 py-2.5 text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-accent)]"
              />
            ) : null}
          </div>
          {dayTemplates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-shell-panel)] px-5 py-8 text-center">
              <p className="text-sm text-[var(--color-muted)]">No day templates yet.</p>
            </div>
          ) : visibleDayTemplates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-shell-panel)] px-5 py-8 text-center">
              <p className="text-sm text-[var(--color-muted)]">No day templates found.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleDayTemplates.map((template) => {
                const totals = getTemplateMacroTotals(template.items);
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
