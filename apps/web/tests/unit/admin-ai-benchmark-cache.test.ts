import { describe, expect, it } from "vitest";

import { getBaselineCacheCreatedAt } from "@/components/admin-ai-benchmark-client";

describe("getBaselineCacheCreatedAt", () => {
  it("uses the current timestamp for newly measured baselines", () => {
    expect(
      getBaselineCacheCreatedAt(
        { baselineCreatedAt: null, usedBaseline: false },
        "2026-06-19T12:00:00.000Z",
      ),
    ).toBe("2026-06-19T12:00:00.000Z");
  });

  it("preserves the original timestamp for reused baselines", () => {
    expect(
      getBaselineCacheCreatedAt(
        {
          baselineCreatedAt: "2026-06-18T12:00:00.000Z",
          usedBaseline: true,
        },
        "2026-06-19T11:59:00.000Z",
      ),
    ).toBe("2026-06-18T12:00:00.000Z");
  });

  it("does not mint a timestamp for reused baselines without one", () => {
    expect(
      getBaselineCacheCreatedAt(
        { baselineCreatedAt: null, usedBaseline: true },
        "2026-06-19T12:00:00.000Z",
      ),
    ).toBeNull();
  });
});
