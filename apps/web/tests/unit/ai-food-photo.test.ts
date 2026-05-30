import { describe, expect, it } from "vitest";

import { parseFoodPhotoAnalysis } from "@/lib/ai-food-photo";

describe("parseFoodPhotoAnalysis", () => {
  it("parses a ready nutrition estimate", () => {
    expect(
      parseFoodPhotoAnalysis(
        JSON.stringify({
          status: "ready",
          question: null,
          estimate: {
            label: "Chicken rice bowl",
            caloriesKcal: 612.4,
            proteinG: 42.24,
            carbsG: 58.21,
            fatG: 18.06,
            confidence: 1.3,
            notes: ["Assumes one medium bowl", "Grilled chicken"],
          },
        }),
      ),
    ).toEqual({
      status: "ready",
      question: null,
      estimate: {
        label: "Chicken rice bowl",
        caloriesKcal: 612,
        proteinG: 42.2,
        carbsG: 58.2,
        fatG: 18.1,
        confidence: 1,
        notes: ["Assumes one medium bowl", "Grilled chicken"],
      },
    });
  });

  it("parses a clarification request", () => {
    expect(
      parseFoodPhotoAnalysis(
        JSON.stringify({
          status: "needs_clarification",
          question: "What is the sauce on top?",
          estimate: null,
        }),
      ),
    ).toEqual({
      status: "needs_clarification",
      question: "What is the sauce on top?",
      estimate: null,
    });
  });

  it("accepts numeric strings returned by less strict vision models", () => {
    expect(
      parseFoodPhotoAnalysis(
        JSON.stringify({
          status: "ready",
          question: null,
          estimate: {
            label: "cheeseburger with fries",
            caloriesKcal: 850,
            proteinG: 45,
            carbsG: "75",
            fatG: "45",
            confidence: "0.8",
            notes: ["estimated portion size"],
          },
        }),
      ),
    ).toEqual({
      status: "ready",
      question: null,
      estimate: {
        label: "cheeseburger with fries",
        caloriesKcal: 850,
        proteinG: 45,
        carbsG: 75,
        fatG: 45,
        confidence: 0.8,
        notes: ["estimated portion size"],
      },
    });
  });
});
