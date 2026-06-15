"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { apiGet } from "@/lib/api-client";
import { clearPlatformSession, getStoredPlatformAuthToken } from "@/lib/platform-session";

type OnboardingStatus = {
  precisa_onboarding: boolean;
};

export function LandingSessionRedirect() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const token = getStoredPlatformAuthToken();

    if (!token) {
      return;
    }

    async function redirectLoggedAccount() {
      try {
        const status = await apiGet<OnboardingStatus>("/onboarding/status", { token });

        if (cancelled) {
          return;
        }

        router.replace(status.precisa_onboarding ? "/onboarding" : "/meu-sistema");
      } catch {
        if (!cancelled) {
          clearPlatformSession();
        }
      }
    }

    void redirectLoggedAccount();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
