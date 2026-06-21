import { redirect } from "next/navigation";

import { OnboardingShell } from "@/components/onboarding-shell";
import { getCurrentAppUser } from "@/lib/auth";
import { getLocalDateString } from "@/lib/startup-date";

export default async function OnboardingPage() {
  const user = await getCurrentAppUser();

  if (!user) {
    redirect("/api/auth/logout?expired=1");
  }

  if (user.onboardingCompletedAt) {
    redirect("/");
  }

  return (
    <OnboardingShell
      userEmail={user.email}
      currentDate={getLocalDateString()}
      preferredWeightUnit={user.preferredWeightUnit}
    />
  );
}
