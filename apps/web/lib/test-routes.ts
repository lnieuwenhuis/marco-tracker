import { NextResponse } from "next/server";

const TEST_ROUTE_SECRET_HEADER = "x-test-route-secret";

type TestRouteEnv = {
  enableTestRoutes: boolean;
  testRoutesSecret: string | undefined;
};

function hasValidTestRouteSecret(request: Request, env: TestRouteEnv) {
  return Boolean(
    env.testRoutesSecret &&
      request.headers.get(TEST_ROUTE_SECRET_HEADER) === env.testRoutesSecret,
  );
}

export function ensureTestRouteRequest(request: Request, env: TestRouteEnv) {
  if (!env.enableTestRoutes) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (!hasValidTestRouteSecret(request, env)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  return null;
}
