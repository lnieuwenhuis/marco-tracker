"use client";

import type { RecipeRecord } from "@macro-tracker/db";
import { useEffect, useMemo, useRef, useState } from "react";
import { CloseButton } from "./close-button";
import { OverlayPortal, useBodyScrollLock, useEscapeDismiss } from "./overlay-portal";

type RecipePickerModalProps = {
  recipes: RecipeRecord[];
  onClose: () => void;
  onSelect: (recipe: RecipeRecord) => void;
};

export function RecipePickerModal({
  recipes,
  onClose,
  onSelect,
}: RecipePickerModalProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useBodyScrollLock();
  useEscapeDismiss(true, onClose);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleRecipes = useMemo(
    () =>
      normalizedQuery
        ? recipes.filter((recipe) =>
            recipe.label.toLowerCase().includes(normalizedQuery),
          )
        : recipes,
    [normalizedQuery, recipes],
  );

  return (
    <OverlayPortal>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pick a Recipe"
        className="fixed inset-x-4 top-[8%] z-50 mx-auto max-h-[82vh] max-w-sm overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-5 shadow-2xl"
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-[var(--color-ink)]">
            Pick a Recipe
          </h2>
          <CloseButton
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
            iconSize={18}
          />
        </div>

        {recipes.length > 0 ? (
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search recipes"
            className="mb-4 w-full rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-card-muted)] px-3 py-2.5 text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-accent)]"
          />
        ) : null}

        {/* Empty state */}
        {recipes.length === 0 && (
          <p className="py-3 text-center text-sm text-[var(--color-muted)]">
            No recipes yet — create one from the Recipes page.
          </p>
        )}

        {recipes.length > 0 && visibleRecipes.length === 0 ? (
          <p className="py-3 text-center text-sm text-[var(--color-muted)]">
            No recipes found.
          </p>
        ) : null}

        {/* Recipe list */}
        {visibleRecipes.length > 0 && (
          <div className="space-y-2">
            {visibleRecipes.map((recipe) => (
              <div
                key={recipe.id}
                className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card-subtle)] px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--color-ink)]">
                    {recipe.label}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5">
                    <span className="text-[10px] font-semibold text-[var(--color-bar-protein)]">
                      P {recipe.perPortionMacros.proteinG}g
                    </span>
                    <span className="text-[10px] font-semibold text-[var(--color-bar-carbs)]">
                      C {recipe.perPortionMacros.carbsG}g
                    </span>
                    <span className="text-[10px] font-semibold text-[var(--color-bar-fat)]">
                      F {recipe.perPortionMacros.fatG}g
                    </span>
                    <span className="text-[10px] font-semibold text-[var(--color-muted)]">
                      {recipe.perPortionMacros.caloriesKcal} kcal
                    </span>
                    <span className="text-[10px] text-[var(--color-muted)]">
                      / portion
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onSelect(recipe)}
                  className="shrink-0 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-white transition hover:-translate-y-0.5"
                >
                  Add
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </OverlayPortal>
  );
}
