# Macro Tracker

A Next.js macro tracking app for logging meals, tracking goals and weight, saving reusable meal templates, scanning barcodes, and reviewing nutrition trends.

Current app version: `v2.06`

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

## Environment and Deployment

Set these values for deployed environments:

| Variable | Notes |
| --- | --- |
| `APP_URL` | Required in production. Use the public app URL, including protocol, for redirects and origin checks. |
| `SESSION_SECRET` | Required in production. Use a long random value for session signing. |
| `DATABASE_URL` | Required for the app database. Use `memory:` or `file:<path>` for PGlite, or a PostgreSQL URL for deployed databases. |
| `APP_TRUSTED_ORIGINS` | Optional comma-separated list of additional full origins allowed for auth flows, for example `https://preview.example.com,https://app.example.com`. |
| `ENABLE_TEST_ROUTES` | Set to `true` only for controlled test runs that need the Playwright-only helper routes. Test routes are also enabled when `NODE_ENV=test`. |
| `TEST_ROUTES_SECRET` | Required by enabled test routes. Send it in the `x-test-route-secret` header; production deployments should leave test routes disabled. |
