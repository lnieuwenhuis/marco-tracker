import { canAccessAdmin, ensureDateString, getUserById } from "@macro-tracker/db";

import { requireOnboardedSessionUser } from "./auth";

export type DateSearchParams = {
  date?: string;
};

export async function loadOnboardedDateParam<TSearchParams extends DateSearchParams>(
  searchParams: Promise<TSearchParams>,
) {
  const sessionUser = await requireOnboardedSessionUser();
  const params = await searchParams;
  const selectedDate = ensureDateString(params.date);

  return {
    params,
    sessionUser,
    selectedDate,
  };
}

export async function loadOnboardedPageContext<TSearchParams extends DateSearchParams>(
  searchParams: Promise<TSearchParams>,
) {
  const { params, sessionUser, selectedDate } =
    await loadOnboardedDateParam(searchParams);
  const user = await getUserById(sessionUser.userId);

  return {
    params,
    sessionUser,
    selectedDate,
    userEmail: user?.email ?? sessionUser.email,
    canAccessAdmin: user ? canAccessAdmin(user.role) : false,
  };
}
