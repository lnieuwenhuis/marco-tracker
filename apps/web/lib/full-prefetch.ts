import type { useRouter } from "next/navigation";

type AppRouter = ReturnType<typeof useRouter>;
type PrefetchOptions = NonNullable<Parameters<AppRouter["prefetch"]>[1]>;

const FULL_PREFETCH_OPTIONS: PrefetchOptions = {
  kind: "full" as PrefetchOptions["kind"],
};
const PREFETCH_DEDUPE_MS = 15_000;

const recentPrefetches = new Map<string, number>();

export function prefetchFullRoute(router: AppRouter, href: string) {
  const now = Date.now();
  const lastPrefetchedAt = recentPrefetches.get(href);

  if (
    lastPrefetchedAt !== undefined &&
    now - lastPrefetchedAt < PREFETCH_DEDUPE_MS
  ) {
    return;
  }

  recentPrefetches.set(href, now);
  router.prefetch(href, FULL_PREFETCH_OPTIONS);
}

export function resetFullRoutePrefetchCache() {
  recentPrefetches.clear();
}
