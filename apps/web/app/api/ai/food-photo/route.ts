import { getCurrentSessionUser } from "@/lib/auth";
import { analyzeFoodPhoto } from "@/lib/ai-food-photo";

export async function POST(request: Request) {
  const sessionUser = await getCurrentSessionUser();
  if (!sessionUser) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const formData = await request.formData();
  const image = formData.get("image");
  const clarificationValue = formData.get("clarification");
  const clarification =
    typeof clarificationValue === "string" ? clarificationValue : "";

  if (!(image instanceof File)) {
    return Response.json(
      { ok: false, error: "A food photo is required." },
      { status: 400 },
    );
  }

  const result = await analyzeFoodPhoto({
    image,
    clarification,
    userId: sessionUser.userId,
  });

  return Response.json(result, {
    status: result.ok ? 200 : result.statusCode ?? 400,
  });
}
