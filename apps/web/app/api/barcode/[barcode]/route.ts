import { NextResponse } from "next/server";

import { lookupBarcodeFoodProduct } from "@macro-tracker/db";

import { lookupBarcodeChain } from "@/lib/barcode-providers";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ barcode: string }> },
) {
  const { barcode } = await params;

  if (!barcode || barcode.length < 4 || barcode.length > 20) {
    return NextResponse.json(
      { found: false, barcode, error: "Invalid barcode" },
      { status: 400 },
    );
  }

  // 0. Check our barcode food catalogue first — fastest and most reliable.
  //    Wrapped in try/catch so a database error never blocks the external
  //    provider chain that follows.
  try {
    const product = await lookupBarcodeFoodProduct(barcode);
    if (product) {
      return NextResponse.json({
        found: true,
        product: {
          name: product.name,
          brands: product.brand,
          barcode: product.barcode,
          proteinG: product.proteinPer100,
          carbsG: product.carbsPer100,
          fatG: product.fatPer100,
          caloriesKcal: product.caloriesPer100,
          servingSizeG: product.servingWeightG,
          imageUrl: null,
          source: "custom",
        },
      });
    }
  } catch {
    // Database unavailable — fall through to external providers
  }

  // 1–3. Fall back to the external provider chain (OFF → AH → Jumbo)
  try {
    const result = await lookupBarcodeChain(barcode);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ found: false, barcode }, { status: 502 });
  }
}
