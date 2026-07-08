"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

import { apiGet } from "@/lib/api-client";
import {
  clearPlatformSession,
  getStoredPlatformAuthToken,
  PLATFORM_ACCESS_VALIDATED_AT_STORAGE_KEY,
  PLATFORM_ACCOUNT_PERMISSIONS_STORAGE_KEY,
  PLATFORM_ACCOUNT_TYPE_STORAGE_KEY
} from "@/lib/platform-session";
import { hasFiscalEntitlement, loadSubscriptionEntitlements } from "@/lib/subscription-entitlements";

type OnboardingStatus = {
  precisa_onboarding: boolean;
};

type PlatformAccessGuardProps = {
  children: ReactNode;
};

const routePermissions = [
  { prefix: "/meu-sistema/configuracoes", permission: "configuracoes" },
  { prefix: "/meu-sistema/grupos-fiscais", permission: "grupos_fiscais" },
  { prefix: "/meu-sistema/produtos", permission: "produtos" },
  { prefix: "/meu-sistema/estoque", permission: "estoque" },
  { prefix: "/meu-sistema/conferencia-caixa", permission: "conferencia_caixa" },
  { prefix: "/meu-sistema/convenios", permission: "convenios" },
  { prefix: "/meu-sistema/despesas", permission: "despesas" },
  { prefix: "/meu-sistema/documentos-fiscais", permission: "documentos_fiscais" },
  { prefix: "/meu-sistema/funcionarios", permission: "funcionarios" },
  { prefix: "/configuracoes", permission: "configuracoes" },
  { prefix: "/grupos-fiscais", permission: "grupos_fiscais" },
  { prefix: "/produtos", permission: "produtos" },
  { prefix: "/estoque", permission: "estoque" },
  { prefix: "/conferencia-caixa", permission: "conferencia_caixa" },
  { prefix: "/convenios", permission: "convenios" },
  { prefix: "/despesas", permission: "despesas" },
  { prefix: "/documentos-fiscais", permission: "documentos_fiscais" },
  { prefix: "/funcionarios", permission: "funcionarios" }
];

const fiscalEntitlementRoutes = [
  "/meu-sistema/grupos-fiscais",
  "/meu-sistema/documentos-fiscais",
  "/grupos-fiscais",
  "/documentos-fiscais"
];
const accessValidationCacheTtlMs = 5 * 60_000;

function readStoredPermissions() {
  const rawPermissions = window.localStorage.getItem(PLATFORM_ACCOUNT_PERMISSIONS_STORAGE_KEY);

  if (!rawPermissions) {
    return ["*"];
  }

  try {
    const parsed = JSON.parse(rawPermissions);
    return Array.isArray(parsed) ? parsed : ["*"];
  } catch {
    return ["*"];
  }
}

function hasRecentAccessValidation() {
  const rawTimestamp = window.localStorage.getItem(PLATFORM_ACCESS_VALIDATED_AT_STORAGE_KEY);
  const timestamp = rawTimestamp ? Number(rawTimestamp) : 0;

  return Number.isFinite(timestamp) && Date.now() - timestamp < accessValidationCacheTtlMs;
}

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

    const authToken = token;

    async function validateAccess() {
      const accountType = window.localStorage.getItem(PLATFORM_ACCOUNT_TYPE_STORAGE_KEY);
      const permissions = readStoredPermissions();
      const requiredPermission = routePermissions.find((route) =>
        pathname.startsWith(route.prefix)
      )?.permission;
      const isMainAccountOnlyPage = pathname.startsWith("/conta");
      const requiresFiscalEntitlement = fiscalEntitlementRoutes.some((route) => pathname.startsWith(route));
      const canAccessPage =
        accountType !== "subconta" ||
        (!isMainAccountOnlyPage &&
          (!requiredPermission || permissions.includes("*") || permissions.includes(requiredPermission)));

      if (!canAccessPage) {
        router.replace("/meu-sistema");
        return;
      }

      if (!requiresFiscalEntitlement && (pathname.startsWith("/conta") || hasRecentAccessValidation())) {
        setIsAllowed(true);
      }

      try {
        if (requiresFiscalEntitlement) {
          const entitlements = await loadSubscriptionEntitlements(authToken);

          if (cancelled) {
            return;
          }

          if (!hasFiscalEntitlement(entitlements)) {
            router.replace("/meu-sistema?bloqueio=emissao_fiscal");
            return;
          }
        }

        const status = await apiGet<OnboardingStatus>("/onboarding/status", {
          cacheTtlMs: 120_000,
          token: authToken
        });

        if (cancelled) {
          return;
        }

        if (status.precisa_onboarding) {
          router.replace("/onboarding");
          return;
        }

        window.localStorage.setItem(PLATFORM_ACCESS_VALIDATED_AT_STORAGE_KEY, String(Date.now()));
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
