import { handleApiV1Request } from "@/lib/api-v1";

export const runtime = "nodejs";

type ApiV1RouteContext = {
  params: Promise<{
    path?: string[];
  }>;
};

async function handle(request: Request, context: ApiV1RouteContext) {
  const params = await context.params;
  return handleApiV1Request(request, params.path);
}

export async function GET(request: Request, context: ApiV1RouteContext) {
  return handle(request, context);
}

export async function POST(request: Request, context: ApiV1RouteContext) {
  return handle(request, context);
}

export async function PATCH(request: Request, context: ApiV1RouteContext) {
  return handle(request, context);
}

export async function DELETE(request: Request, context: ApiV1RouteContext) {
  return handle(request, context);
}

export async function OPTIONS(request: Request, context: ApiV1RouteContext) {
  return handle(request, context);
}
