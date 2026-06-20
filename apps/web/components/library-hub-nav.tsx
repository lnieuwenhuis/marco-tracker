"use client";

import { TransitionLink } from "./transition-link";

type LibraryHubKey = "library" | "recipes" | "planner";

type LibraryHubNavProps = {
  active: LibraryHubKey;
  selectedDate: string;
};

const HUB_ITEMS: Array<{
  id: LibraryHubKey;
  label: string;
  detail: string;
  href: (selectedDate: string) => string;
}> = [
  {
    id: "library",
    label: "Food Library",
    detail: "Foods, recipes, templates",
    href: (selectedDate) => `/library?date=${selectedDate}`,
  },
  {
    id: "recipes",
    label: "Recipes",
    detail: "Build reusable meals",
    href: (selectedDate) => `/recipes?date=${selectedDate}`,
  },
  {
    id: "planner",
    label: "Planner",
    detail: "Save and apply days",
    href: (selectedDate) => `/planner?date=${selectedDate}`,
  },
];

export function LibraryHubNav({ active, selectedDate }: LibraryHubNavProps) {
  return (
    <nav
      aria-label="Food library sections"
      className="grid gap-2 sm:grid-cols-3"
    >
      {HUB_ITEMS.map((item) => {
        const isActive = active === item.id;

        return (
          <TransitionLink
            key={item.id}
            href={item.href(selectedDate)}
            motion="screen"
            aria-current={isActive ? "page" : undefined}
            className={[
              "rounded-2xl border px-4 py-3 transition hover:-translate-y-0.5",
              isActive
                ? "border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_13%,var(--color-surface-strong))] text-[var(--color-accent)] shadow-sm"
                : "border-[var(--color-border)] bg-[var(--color-surface-strong)] text-[var(--color-ink)] hover:bg-[var(--color-card-muted)]",
            ].join(" ")}
          >
            <span className="block text-sm font-bold">{item.label}</span>
            <span
              className={[
                "mt-1 block text-xs",
                isActive ? "text-[var(--color-accent)]" : "text-[var(--color-muted)]",
              ].join(" ")}
            >
              {item.detail}
            </span>
          </TransitionLink>
        );
      })}
    </nav>
  );
}
