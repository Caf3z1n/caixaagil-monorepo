"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

import { apiGet } from "@/lib/api-client";
import {
  clearPlatformSession,
  getStoredPlatformAuthToken,
  PLATFORM_ACCOUNT_PERMISSIONS_STORAGE_KEY,
  PLATFORM_ACCOUNT_TYPE_STORAGE_KEY
} from "@/lib/platform-session";

type OnboardingStatus = {
  precisa_onboarding: boolean;
};

type PlatformAccessGuardProps = {
  children: ReactNode;
};

const routePermissions = [
  { prefix: "/subcontas", permission: "pdvs_subcontas" },
  { prefix: "/meu-sistema/grupos-fiscais", permission: "grupos_fiscais" },
  { prefix: "/meu-sistema/produtos", permission: "produtos" },
  { prefix: "/meu-sistema/estoque", permission: "estoque" },
  { prefix: "/grupos-fiscais", permission: "grupos_fiscais" },
  { prefix: "/produtos", permission: "produtos" },
  { prefix: "/estoque", permission: "estoque" }
];

export function PlatformAccessGuard({ children }: PlatformAccessGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const token = getStoredPlatformAuthToken();

    if (!token) {
      clearPlatformSession();
      router.replace("/");
      return;
    }

    async function validateAccess() {
      try {
        const status = await apiGet<OnboardingStatus>("/onboarding/status", { token });

        if (cancelled) {
          return;
        }

        if (status.precisa_onboarding) {
          router.replace("/onboarding");
          return;
        }

        const accountType = window.localStorage.getItem(PLATFORM_ACCOUNT_TYPE_STORAGE_KEY);
        const rawPermissions = window.localStorage.getItem(PLATFORM_ACCOUNT_PERMISSIONS_STORAGE_KEY);
        let permissions: string[] = ["*"];

        if (rawPermissions) {
          try {
            const parsed = JSON.parse(rawPermissions);
            permissions = Array.isArray(parsed) ? parsed : ["*"];
          } catch {
            permissions = ["*"];
          }
        }

        const requiredPermission = routePermissions.find(route =>
          pathname.startsWith(route.prefix)
        )?.permission;
        const isMainAccountOnlyPage = pathname.startsWith("/meu-sistema/configuracoes");
        const canAccessPage =
          accountType !== "subconta" ||
          (!isMainAccountOnlyPage && (!requiredPermission || permissions.includes(requiredPermission)));

        if (!canAccessPage) {
          router.replace("/meu-sistema");
          return;
        }

        setIsAllowed(true);
      } catch {
        if (!cancelled) {
          clearPlatformSession();
          router.replace("/");
        }
      }
    }

    void validateAccess();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (!isAllowed) {
    return (
      <main className="onboarding-page">
        <section className="onboarding-card onboarding-card-compact" aria-live="polite">
          <span className="onboarding-status-icon">
            <LoaderCircle aria-hidden="true" className="onboarding-spin" size={24} />
          </span>
          <h1>Verificando acesso</h1>
          <p>Estamos conferindo sua sessão antes de abrir a plataforma.</p>
        </section>
      </main>
    );
  }

  return children;
}
