import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { invalidateAppDataCache } from "@/components/app-data-cache";
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
    vi.unstubAllGlobals();
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

  it("allows the same route to prefetch again after app data invalidation", () => {
    const router = createRouter();

    vi.stubGlobal("CustomEvent", class CustomEvent<T = unknown> {
      detail: T | undefined;
      type: string;

      constructor(type: string, init?: CustomEventInit<T>) {
        this.type = type;
        this.detail = init?.detail;
      }
    });
    vi.stubGlobal("window", {
      dispatchEvent: vi.fn(),
    });

    prefetchFullRoute(router, "/library?date=2026-06-20");
    invalidateAppDataCache(["recipes"]);
    prefetchFullRoute(router, "/library?date=2026-06-20");

    expect(router.prefetch).toHaveBeenCalledTimes(2);
  });
});
