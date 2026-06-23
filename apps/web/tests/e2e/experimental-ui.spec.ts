import { expect, test, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";

async function enableExperimentalUi(page: Page) {
  await expect(page.getByRole("button", { name: "Open settings" })).toBeVisible();
}

test("canonical app navigation and settings are visible", async ({ page }) => {
  await page.goto("/api/test/session?email=coach@example.com");
  await page.goto("/?date=2026-03-19");
  await expect(page.getByRole("button", { name: "Open settings" })).toBeVisible();

  await expect(page.getByRole("link", { name: "Food Log" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Progress" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add food" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Library" })).toHaveAttribute(
    "href",
    "/library?date=2026-03-19",
  );
  await expect(page.getByRole("link", { name: "Summary" })).toBeVisible();
  await expect(page.getByText("Your Records")).toHaveCount(0);

  await page.getByRole("link", { name: "Library" }).click();
  await expect(page).toHaveURL(/\/library\?date=2026-03-19$/);
  const libraryHub = page.getByRole("navigation", { name: "Food library sections" });
  await expect(libraryHub.getByRole("link", { name: /Food Library/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(libraryHub.getByRole("link", { name: /Recipes/ })).toHaveAttribute(
    "href",
    "/recipes?date=2026-03-19",
  );
  await expect(libraryHub.getByRole("link", { name: /Planner/ })).toHaveAttribute(
    "href",
    "/planner?date=2026-03-19",
  );
  await expect(page.getByRole("heading", { name: "Food item templates" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Day templates" })).toBeVisible();

  await libraryHub.getByRole("link", { name: /Planner/ }).click();
  await expect(page).toHaveURL(/\/planner\?date=2026-03-19$/);
  await expect(page.getByRole("heading", { name: "Save currently selected day" })).toBeVisible();
  await expect(page.getByText("Selected day", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Open log", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Food items/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Days/ })).toBeVisible();

  await page.getByRole("button", { name: "Open settings" }).click();
  await expect(page.getByText("Theme", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Food Library", exact: true })).toHaveAttribute(
    "href",
    "/library?date=2026-03-19",
  );
  await expect(page.getByRole("link", { name: "Meal Planner", exact: true })).toHaveAttribute(
    "href",
    "/planner?date=2026-03-19",
  );
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByRole("switch", { name: /Legacy UI/i })).toHaveCount(0);
});

test("keeps the bottom nav anchored when visual viewport is shortened on launch", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
    const fakeVisualViewport = {
      height: 516,
      offsetTop: 0,
      addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        const typeListeners = listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
        typeListeners.add(listener);
        listeners.set(type, typeListeners);
      },
      removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        listeners.get(type)?.delete(listener);
      },
    };

    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: fakeVisualViewport,
    });
  });

  await page.goto("/api/test/session?email=user@example.com");
  await page.goto("/?date=2026-03-19");

  const primaryNav = page.getByRole("navigation", { name: "Primary" });
  await expect(primaryNav).toBeVisible();

  const navBox = await primaryNav.boundingBox();
  const viewport = page.viewportSize();
  expect(navBox).not.toBeNull();
  expect(viewport).not.toBeNull();

  const bottomGap = viewport!.height - (navBox!.y + navBox!.height);
  expect(bottomGap).toBeLessThanOrEqual(24);
});

test("keeps low meal action menus above the bottom controls", async ({ page }) => {
  const suffix = Date.now();
  const targetLabel = `Low menu item ${suffix}`;
  const templateLabel = `Low menu day ${suffix}`;
  const items = Array.from({ length: 8 }, (_, index) => ({
    label: index === 7 ? targetLabel : `Menu spacer ${index + 1} ${suffix}`,
    proteinG: 20 + index,
    carbsG: 30 + index,
    fatG: 5 + index,
    caloriesKcal: 250 + index,
  }));

  await page.goto("/api/test/session?email=user@example.com");
  await enableExperimentalUi(page);
  const seedResult = await page.evaluate(
    async ({ items, templateLabel }) => {
      const response = await fetch("/api/test/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "day",
          label: templateLabel,
          items,
        }),
      });
      return { ok: response.ok, status: response.status };
    },
    { items, templateLabel },
  );
  expect(seedResult).toEqual({ ok: true, status: 200 });

  await page.goto("/?date=2035-06-22");
  await page.getByRole("button", { name: "From template" }).click();
  const modal = page.getByRole("dialog", { name: "Meal Templates" });
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: /Days/ }).click();
  const templateRow = modal
    .getByText(templateLabel)
    .locator("xpath=ancestor::div[contains(@class,'flex items-center gap-2')][1]");
  await templateRow.getByRole("button", { name: "Add" }).click();
  await expect(modal).toBeHidden();

  const targetCard = page.locator("article").filter({
    has: page.getByRole("heading", { name: targetLabel }),
  });
  await expect(targetCard).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

  const trigger = targetCard.getByRole("button", {
    name: `More actions for ${targetLabel}`,
  });
  await expect(trigger).toBeVisible();
  await trigger.click();

  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "Copy to today" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Delete" })).toBeVisible();

  const [triggerBox, menuBox] = await Promise.all([
    trigger.boundingBox(),
    menu.boundingBox(),
  ]);

  expect(triggerBox).not.toBeNull();
  expect(menuBox).not.toBeNull();
  expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(triggerBox!.y);

  await menu.getByRole("menuitem", { name: "Copy to today" }).click();
  await expect(menu).toBeHidden();
});

test("experimental mode supports the bottom add flow and merged progress routes", async ({
  page,
}) => {
  await page.goto("/api/test/session?email=user@example.com");
  await enableExperimentalUi(page);

  await page.goto("/summary?date=2026-03-19");
  await expect(page.getByRole("link", { name: "Summary" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByLabel("Pick a day")).toHaveCount(0);
  await expect(page.getByText("Daily Snapshot")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Macro Trends" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Historical Insights" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No stats yet" })).toBeVisible();

  await page.getByRole("button", { name: "Add food" }).click();
  await expect(page.getByRole("button", { name: "Custom" })).toBeVisible();
  await page.getByRole("button", { name: "Custom" }).click();

  await expect(page).toHaveURL(/\/\?date=2026-03-19$/);
  const mealCard = page.locator("article").last();
  await expect(mealCard.getByRole("button", { name: "Save" })).toBeVisible();

  await page.getByRole("link", { name: "Progress" }).click();
  await expect(page).toHaveURL(/\/progress\?date=2026-03-19&tab=goals/);
  await expect(page.getByText("Daily Goals")).toBeVisible();

  await page.getByRole("tab", { name: "Weight" }).click();
  await expect(page).toHaveURL(/\/progress\?date=2026-03-19&tab=weight/);
  await expect(page.getByText("Log Weight")).toBeVisible();

  await page.goto("/weight?date=2026-03-19");
  await expect(page).toHaveURL(/\/progress\?date=2026-03-19&tab=weight/);

  await page.goto("/stats?date=2026-03-19");
  await expect(page).toHaveURL(/\/summary\?date=2026-03-19/);
});

test("goals page includes the macro calculator and applies calculated targets", async ({
  page,
}) => {
  await page.goto("/api/test/session?email=user@example.com");
  await page.goto("/progress?date=2026-03-19&tab=goals");

  await expect(page.getByRole("heading", { name: "Macro calculator" })).toBeVisible();
  await page.getByRole("spinbutton", { name: "Age yrs" }).fill("30");
  await page.getByRole("spinbutton", { name: "Height cm" }).fill("180");
  await page.getByRole("spinbutton", { name: "Weight kg" }).fill("80");
  await page.getByRole("button", { name: /Moderate cut/ }).click();

  await expect(page.getByText("2259 kcal").first()).toBeVisible();
  await expect(page.getByText("144 g")).toBeVisible();

  await page.getByRole("button", { name: "Apply to targets" }).click();

  await expect(page.getByRole("spinbutton", { name: "Calories kcal" })).toHaveValue("2259");
  await expect(page.getByRole("spinbutton", { name: "Protein g" })).toHaveValue("144");
  await expect(page.getByRole("spinbutton", { name: "Carbs g" })).toHaveValue("210.4");
  await expect(page.getByRole("spinbutton", { name: "Fat g" })).toHaveValue("93.5");
});

test("photo estimate modal stays open while analyzing", async ({ page }) => {
  await page.route("/api/ai/food-photo", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        analysis: {
          status: "ready",
          question: null,
          estimate: {
            label: "banana",
            caloriesKcal: 105,
            proteinG: 1.3,
            carbsG: 27,
            fatG: 0.4,
            notes: [],
          },
        },
      }),
    });
  });

  await page.goto("/api/test/session?email=user@example.com");

  await page.getByRole("button", { name: "Add food" }).click();
  await page.getByRole("button", { name: "Photo" }).click();
  await expect(page.getByRole("heading", { name: "Estimate from photo" })).toBeVisible();

  await page.locator('input[type="file"]').first().setInputFiles({
    name: "banana.png",
    mimeType: "image/png",
    buffer: Buffer.from("not-a-real-png"),
  });

  await page.getByRole("button", { name: "Estimate macros" }).click();
  await expect(page.getByRole("button", { name: "Analyzing..." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Estimate from photo" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "banana" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to log" })).toBeVisible();
});
