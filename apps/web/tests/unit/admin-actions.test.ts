import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  createAdminBarcodeProduct: vi.fn(),
  restoreAdminBarcodeProduct: vi.fn(),
  setUserRole: vi.fn(),
  softDeleteAdminBarcodeProduct: vi.fn(),
  updateAdminBarcodeProduct: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  requireAdminUser: vi.fn(),
  requireOwnerUser: vi.fn(),
}));

vi.mock("@macro-tracker/db", () => ({
  createAdminBarcodeProduct: mocked.createAdminBarcodeProduct,
  restoreAdminBarcodeProduct: mocked.restoreAdminBarcodeProduct,
  setUserRole: mocked.setUserRole,
  softDeleteAdminBarcodeProduct: mocked.softDeleteAdminBarcodeProduct,
  updateAdminBarcodeProduct: mocked.updateAdminBarcodeProduct,
}));

vi.mock("@/lib/auth", () => ({
  requireAdminUser: mocked.requireAdminUser,
  requireOwnerUser: mocked.requireOwnerUser,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocked.revalidatePath,
}));

vi.mock("next/navigation", () => ({
  redirect: mocked.redirect,
}));

import { createAdminBarcodeProductAction } from "@/lib/admin-actions";

function buildBarcodeFormData() {
  const formData = new FormData();
  formData.set("barcode", "8712345000777");
  formData.set("name", "Macro Drink");
  formData.set("brands", "Macro Lab");
  formData.set("proteinG", "20");
  formData.set("carbsG", "8");
  formData.set("fatG", "2");
  formData.set("caloriesKcal", "130");
  formData.set("servingSizeG", "250");
  return formData;
}

describe("admin server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.requireAdminUser.mockResolvedValue({
      id: "admin-1",
      email: "admin@example.com",
      role: "admin",
    });
  });

  it("maps active global barcode unique constraint errors to the admin duplicate message", async () => {
    mocked.createAdminBarcodeProduct.mockRejectedValue(
      new Error(
        'duplicate key value violates unique constraint "food_products_active_global_barcode_key"',
      ),
    );

    await expect(createAdminBarcodeProductAction(buildBarcodeFormData())).rejects.toThrow(
      "redirect:/admin/barcodes?error=That%20barcode%20already%20exists.",
    );

    expect(mocked.redirect).toHaveBeenCalledWith(
      "/admin/barcodes?error=That%20barcode%20already%20exists.",
    );
    expect(mocked.revalidatePath).not.toHaveBeenCalled();
  });
});
