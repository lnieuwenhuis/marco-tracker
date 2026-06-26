import type { Metadata } from "next";
import { listApiTokens } from "@macro-tracker/db";

import { ApiSettingsClient } from "@/components/api-settings-client";
import { requireSessionUser } from "@/lib/auth";
import { getApiTokenScopesForSettings } from "@/lib/api-token-actions";

export const metadata: Metadata = {
  title: "API Access | Macro Tracker",
};

export default async function ApiSettingsPage() {
  const sessionUser = await requireSessionUser();
  const [tokens, scopes] = await Promise.all([
    listApiTokens(sessionUser.userId),
    getApiTokenScopesForSettings(),
  ]);

  return <ApiSettingsClient tokens={tokens} scopes={scopes} />;
}
