"use server";

import {
  createApiToken,
  getApiScopes,
  revokeApiToken,
  type ApiTokenRecord,
} from "@macro-tracker/db";
import { revalidatePath } from "next/cache";

import { requireSessionUser } from "./auth";

export type CreateApiTokenActionState = {
  ok?: boolean;
  error?: string;
  token?: string;
  record?: ApiTokenRecord;
};

function getStringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function getSelectedScopes(formData: FormData) {
  return formData
    .getAll("scopes")
    .filter((value): value is string => typeof value === "string");
}

export async function createApiTokenAction(
  _previousState: CreateApiTokenActionState,
  formData: FormData,
): Promise<CreateApiTokenActionState> {
  const sessionUser = await requireSessionUser();
  const name = getStringValue(formData, "name");
  const scopes = getSelectedScopes(formData);
  const expires = getStringValue(formData, "expires");

  try {
    const created = await createApiToken(sessionUser.userId, {
      name,
      scopes,
      expiresAt: expires === "never" ? null : undefined,
    });
    revalidatePath("/settings/api");
    return {
      ok: true,
      token: created.token,
      record: created.record,
    };
  } catch (caught) {
    return {
      ok: false,
      error: caught instanceof Error ? caught.message : "Unable to create API token.",
    };
  }
}

export async function revokeApiTokenAction(formData: FormData) {
  const sessionUser = await requireSessionUser();
  const tokenId = getStringValue(formData, "tokenId");

  if (!tokenId) {
    return;
  }

  await revokeApiToken(sessionUser.userId, tokenId);
  revalidatePath("/settings/api");
}

export async function getApiTokenScopesForSettings() {
  return getApiScopes();
}
