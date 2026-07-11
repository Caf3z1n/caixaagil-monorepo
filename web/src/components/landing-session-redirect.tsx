"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { ApiError, apiGet } from "@/lib/api-client";
import { clearPlatformSession, getStoredPlatformAuthToken } from "@/lib/platform-session";

type OnboardingStatus = {
  precisa_onboarding: boolean;
};

export function LandingSessionRedirect() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let preservesBlockedSession = false;
    const token = getStoredPlatformAuthToken();

    if (!token) {
      return;
    }

    if (new URLSearchParams(window.location.search).get("recontratar") === "1") {
      preservesBlockedSession = true;
      document.documentElement.dataset.subscriptionRecovery = "true";
    }

    async function redirectLoggedAccount() {
      try {
        const status = await apiGet<OnboardingStatus>("/onboarding/status", { token });

        if (cancelled) {
          return;
        }

        delete document.documentElement.dataset.subscriptionRecovery;
        router.replace(status.precisa_onboarding ? "/onboarding" : "/meu-sistema");
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (error instanceof ApiError && error.code === "SUBSCRIPTION_BLOCKED") {
          preservesBlockedSession = true;
          document.documentElement.dataset.subscriptionRecovery = "true";
          return;
        }

        delete document.documentElement.dataset.subscriptionRecovery;
        clearPlatformSession();
      }
    }

    void redirectLoggedAccount();

    return () => {
      cancelled = true;

      if (preservesBlockedSession) {
        delete document.documentElement.dataset.subscriptionRecovery;
      }
    };
  }, [router]);

  return null;
}
