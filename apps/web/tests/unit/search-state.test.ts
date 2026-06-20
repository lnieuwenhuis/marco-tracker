import { describe, expect, it } from "vitest";

import {
  hasCurrentFoodSearchResults,
  normalizeFoodSearchQuery,
} from "@/lib/food-search-state";
import {
  filterLibraryItemsByQuery,
  normalizeLibraryQuery,
} from "@/lib/library-search";

describe("food search result state", () => {
  it("matches result sets only to the current trimmed query", () => {
    expect(normalizeFoodSearchQuery("  milk  ")).toBe("milk");
    expect(hasCurrentFoodSearchResults("milk", " milk ")).toBe(true);
    expect(hasCurrentFoodSearchResults("milk", "egg")).toBe(false);
    expect(hasCurrentFoodSearchResults("milk", "   ")).toBe(false);
  });
});

describe("library search state", () => {
  it("filters local library sections from the current query value", () => {
    const items = [
      { label: "Greek yogurt breakfast" },
      { label: "Egg fried rice" },
      { label: "Chicken salad" },
    ];

    expect(normalizeLibraryQuery("  RICE ")).toBe("rice");
    expect(filterLibraryItemsByQuery(items, " rice ", (item) => item.label)).toEqual([
      { label: "Egg fried rice" },
    ]);
    expect(filterLibraryItemsByQuery(items, "", (item) => item.label)).toBe(items);
  });
});
