import { describe, expect, it } from "vitest";

import {
  APP_VERSION,
  APP_VERSION_LABEL,
  formatAppVersionLabel,
} from "@/lib/app-version";

describe("app version label", () => {
  it("derives the public app label from the canonical app version", () => {
    expect(APP_VERSION_LABEL).toBe(formatAppVersionLabel(APP_VERSION));
  });

  it("keeps the compact release label format", () => {
    expect(formatAppVersionLabel("2.6.0")).toBe("v2.06");
    expect(formatAppVersionLabel("2.12.3")).toBe("v2.12");
  });
});
