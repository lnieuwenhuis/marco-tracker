# Macro Tracker

A Next.js macro tracking app for logging meals, tracking goals and weight, saving reusable meal templates, scanning barcodes, and reviewing nutrition trends.

## Workspace

- `apps/web` - Next.js web app and PWA surface.
- `packages/db` - Drizzle schema, migrations, query layer, and DB tests.

## Core Features

- Daily food log with eaten/planned/skipped entries.
- Goals and weight tracking in the unified Progress page.
- Summary page with rolling averages, adherence, trends, records, and top foods.
- Recipes, meal templates, Library, and Planner workflows.
- Canonical barcode products stored in `food_products` with revision history.
- Admin panel for users, barcode moderation, and audit history.
- First-run onboarding for goals, weight preferences, starter template, and theme.

## Development

```bash
pnpm install
pnpm --filter @macro-tracker/db test -- --run
pnpm --filter @macro-tracker/web test -- --run
pnpm --filter @macro-tracker/web dev
```

Useful checks:

```bash
pnpm --filter @macro-tracker/db exec tsc --noEmit
pnpm --filter @macro-tracker/web exec tsc --noEmit
```
