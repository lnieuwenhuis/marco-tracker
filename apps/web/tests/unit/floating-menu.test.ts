import { describe, expect, it } from "vitest";

import { getFloatingMenuLayout } from "@/lib/floating-menu";

describe("getFloatingMenuLayout", () => {
  it("keeps a menu below the trigger when it fits above fixed bottom controls", () => {
    expect(
      getFloatingMenuLayout({
        triggerTop: 260,
        triggerBottom: 292,
        menuHeight: 220,
        viewportHeight: 852,
        bottomInset: 112,
      }),
    ).toEqual({
      placement: "below",
      maxHeight: 444,
    });
  });

  it("flips the menu above a low trigger when bottom controls would cover it", () => {
    expect(
      getFloatingMenuLayout({
        triggerTop: 720,
        triggerBottom: 752,
        menuHeight: 220,
        viewportHeight: 852,
        bottomInset: 112,
      }),
    ).toEqual({
      placement: "above",
      maxHeight: 708,
    });
  });

  it("uses the side with more room when the full menu cannot fit either way", () => {
    expect(
      getFloatingMenuLayout({
        triggerTop: 210,
        triggerBottom: 242,
        menuHeight: 420,
        viewportHeight: 520,
        bottomInset: 112,
      }),
    ).toEqual({
      placement: "above",
      maxHeight: 198,
    });
  });
});
