import type { Page, TestInfo } from "@playwright/test";

type TestUserBase = "coach" | "owner" | "admin" | "user" | "setup";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export function uniqueTestEmail(base: TestUserBase, testInfo: TestInfo) {
  const slug = slugify(testInfo.title);
  return `${base}+w${testInfo.workerIndex}-r${testInfo.retry}-l${testInfo.line}-${slug}@example.com`;
}

export async function createTestSession(
  page: Page,
  email: string,
  options?: {
    onboarded?: boolean;
  },
) {
  const params = new URLSearchParams({ email });

  if (options?.onboarded === false) {
    params.set("onboarded", "false");
  }

  await page.goto(`/api/test/session?${params.toString()}`);
}
