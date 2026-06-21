import { describe, expect, it } from "vitest";

import { getVisualViewportBottomOffset } from "@/lib/visual-viewport";

describe("visual viewport helpers", () => {
  it("does not offset when visual viewport metrics are unavailable", () => {
    expect(
      getVisualViewportBottomOffset({
        layoutViewportHeight: 852,
        visualViewport: null,
      }),
    ).toBe(0);
  });

  it("returns the obscured bottom height when the visual viewport is shortened", () => {
    expect(
      getVisualViewportBottomOffset({
        layoutViewportHeight: 852,
        visualViewport: { height: 516, offsetTop: 0 },
      }),
    ).toBe(336);
  });

  it("accounts for a visual viewport offset from the layout viewport top", () => {
    expect(
      getVisualViewportBottomOffset({
        layoutViewportHeight: 852,
        visualViewport: { height: 500, offsetTop: 44 },
      }),
    ).toBe(308);
  });

  it("clamps expanded or invalid visual viewport metrics to zero", () => {
    expect(
      getVisualViewportBottomOffset({
        layoutViewportHeight: 852,
        visualViewport: { height: 900, offsetTop: 0 },
      }),
    ).toBe(0);

    expect(
      getVisualViewportBottomOffset({
        layoutViewportHeight: Number.NaN,
        visualViewport: { height: 516, offsetTop: 0 },
      }),
    ).toBe(0);
  });
});
