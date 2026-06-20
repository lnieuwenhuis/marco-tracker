import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  prefetchFullRoute,
  resetFullRoutePrefetchCache,
} from "@/lib/full-prefetch";

function createRouter() {
  return {
    prefetch: vi.fn(),
  } as unknown as Parameters<typeof prefetchFullRoute>[0];
}

describe("full route prefetching", () => {
  beforeEach(() => {
    resetFullRoutePrefetchCache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T12:00:00.000Z"));
  });

  afterEach(() => {
    resetFullRoutePrefetchCache();
    vi.useRealTimers();
  });

  it("deduplicates repeated full prefetches for the same route", () => {
    const router = createRouter();

    prefetchFullRoute(router, "/?date=2026-06-20");
    prefetchFullRoute(router, "/?date=2026-06-20");

    expect(router.prefetch).toHaveBeenCalledTimes(1);
  });

  it("prefetches the same route again after the short dedupe window", () => {
    const router = createRouter();

    prefetchFullRoute(router, "/?date=2026-06-20");
    vi.advanceTimersByTime(15_001);
    prefetchFullRoute(router, "/?date=2026-06-20");

    expect(router.prefetch).toHaveBeenCalledTimes(2);
  });

  it("does not deduplicate different routes", () => {
    const router = createRouter();

    prefetchFullRoute(router, "/?date=2026-06-20");
    prefetchFullRoute(router, "/?date=2026-06-21");

    expect(router.prefetch).toHaveBeenCalledTimes(2);
  });
});
