"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { FocusEvent, PointerEvent } from "react";
import {
  ArrowRight,
  FileCheck2,
  LayoutGrid,
  PackageSearch,
  ReceiptText,
  Settings2,
  ShieldCheck,
  UsersRound,
  WalletCards,
  Warehouse
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { AuthFeedback } from "@/components/auth-feedback";
import { PlatformFrame } from "@/components/platform-frame";
import { apiGet } from "@/lib/api-client";
import { buildPlatformReturnHref } from "@/lib/platform-return";
import {
  getStoredPlatformAuthToken,
  PLATFORM_ACCOUNT_PERMISSIONS_STORAGE_KEY,
  PLATFORM_ACCOUNT_TYPE_STORAGE_KEY
} from "@/lib/platform-session";
import {
  hasFiscalEntitlement,
  loadSubscriptionEntitlements,
  type SubscriptionEntitlements
} from "@/lib/subscription-entitlements";

type SystemMenuItem = {
  title: string;
  href?: string;
  icon: LucideIcon;
  permission?: string;
  requiredPlanFeature?: PlanFeature;
  requiredFeature?: OptionalSystemFeature;
};

type PlanFeature = "emissao_fiscal";
type OptionalSystemFeature = "customers" | "expenses" | "employees";

type ConfiguracaoSistema = {
  formas_pagamento?: {
    convenio?: boolean;
    parcelamento?: boolean;
  } | null;
  lancar_despesas?: {
    ativo?: boolean;
  } | null;
  controle_funcionarios?: {
    ativo?: boolean;
  } | null;
};

type EnabledSystemFeatures = Record<OptionalSystemFeature, boolean>;

const defaultEnabledSystemFeatures: EnabledSystemFeatures = {
  customers: false,
  expenses: false,
  employees: false
};

const menuItems: SystemMenuItem[] = [
  {
    title: "Grupos fiscais",
    href: "/meu-sistema/grupos-fiscais",
    icon: FileCheck2,
    permission: "grupos_fiscais",
    requiredPlanFeature: "emissao_fiscal"
  },
  {
    title: "Produtos",
    href: "/meu-sistema/produtos",
    icon: PackageSearch,
    permission: "produtos"
  },
  {
    title: "Estoque",
    href: "/meu-sistema/estoque",
    icon: Warehouse,
    permission: "estoque"
  },
  {
    title: "Conferência de caixa",
    href: "/meu-sistema/conferencia-caixa",
    icon: ShieldCheck,
    permission: "conferencia_caixa"
  },
  {
    title: "Configurações",
    href: "/meu-sistema/configuracoes",
    icon: Settings2,
    permission: "configuracoes"
  },
  {
    title: "Funcionários",
    href: "/meu-sistema/funcionarios",
    icon: UsersRound,
    permission: "funcionarios",
    requiredFeature: "employees"
  },
  {
    title: "Despesas",
    href: "/meu-sistema/despesas",
    icon: WalletCards,
    permission: "despesas",
    requiredFeature: "expenses"
  },
  {
    title: "Clientes",
    href: "/meu-sistema/convenios",
    icon: UsersRound,
    permission: "convenios",
    requiredFeature: "customers"
  },
  {
    title: "Documentos fiscais",
    href: "/meu-sistema/documentos-fiscais",
    icon: ReceiptText,
    permission: "documentos_fiscais",
    requiredPlanFeature: "emissao_fiscal"
  }
];

const configurationItem = menuItems.find((item) => item.href === "/meu-sistema/configuracoes");
const baseRoutineItems = menuItems.filter((item) => item.href !== "/meu-sistema/configuracoes");

function setMenuWaveOrigin(target: HTMLElement, x: number, y: number) {
  target.style.setProperty("--system-menu-hover-x", `${x}px`);
  target.style.setProperty("--system-menu-hover-y", `${y}px`);
}

function startMenuPointerWave(event: PointerEvent<HTMLElement>) {
  const target = event.currentTarget;
  const rect = target.getBoundingClientRect();

  setMenuWaveOrigin(target, event.clientX - rect.left, event.clientY - rect.top);
  target.classList.remove("system-home-menu-item--hovering");
  void target.offsetWidth;
  target.classList.add("system-home-menu-item--hovering");
}

function startMenuFocusWave(event: FocusEvent<HTMLElement>) {
  const target = event.currentTarget;
  const rect = target.getBoundingClientRect();

  setMenuWaveOrigin(target, rect.width / 2, rect.height / 2);
  target.classList.remove("system-home-menu-item--hovering");
  void target.offsetWidth;
  target.classList.add("system-home-menu-item--hovering");
}

function stopMenuWave(event: FocusEvent<HTMLElement> | PointerEvent<HTMLElement>) {
  event.currentTarget.classList.remove("system-home-menu-item--hovering");
}

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

function canUseMenuItem(item: SystemMenuItem, accountType: string, accountPermissions: string[]) {
  if (accountType !== "subconta" || !item.permission) {
    return true;
  }

  return accountPermissions.includes("*") || accountPermissions.includes(item.permission);
}

function renderMenuItem(item: SystemMenuItem, featured = false, lockedByPlan = false) {
  const Icon = item.icon;

  if (!item.href || lockedByPlan) {
    return (
      <span
        className="system-home-menu-item system-home-menu-item-disabled"
        key={item.title}
        aria-disabled="true"
      >
        <span className="system-home-menu-icon">
          <Icon aria-hidden="true" size={20} />
        </span>
        <span className="system-home-menu-copy">
          <strong>{item.title}</strong>
        </span>
        <span className="system-home-menu-status">{lockedByPlan ? "Bloqueado" : "Em breve"}</span>
      </span>
    );
  }

  const itemClassName = featured
    ? "system-home-menu-item system-home-menu-item-featured"
    : "system-home-menu-item";

  return (
    <Link
      className={itemClassName}
      href={buildPlatformReturnHref(item.href, "/meu-sistema")}
      key={item.title}
      onBlur={stopMenuWave}
      onFocus={startMenuFocusWave}
      onPointerEnter={startMenuPointerWave}
      onPointerLeave={stopMenuWave}
    >
      <span className="system-home-menu-icon">
        <Icon aria-hidden="true" size={20} />
      </span>
      <span className="system-home-menu-copy">
        <strong>{item.title}</strong>
      </span>
      <ArrowRight aria-hidden="true" size={18} />
    </Link>
  );
}

export default function MeuSistemaPage() {
  const searchParams = useSearchParams();
  const [enabledFeatures, setEnabledFeatures] = useState<EnabledSystemFeatures>(defaultEnabledSystemFeatures);
  const [entitlements, setEntitlements] = useState<SubscriptionEntitlements | null>(null);
  const [accountType, setAccountType] = useState("usuario");
  const [accountPermissions, setAccountPermissions] = useState<string[]>(["*"]);

  useEffect(() => {
    let cancelled = false;
    const token = getStoredPlatformAuthToken();
    const storedType = window.localStorage.getItem(PLATFORM_ACCOUNT_TYPE_STORAGE_KEY) || "usuario";
    const storedPermissions = readStoredPermissions();

    setAccountType(storedType);
    setAccountPermissions(storedPermissions);

    if (!token) {
      return;
    }

    const authToken = token;
    const isSubaccount = storedType === "subconta";

    async function loadConfiguration() {
      try {
        if (isSubaccount) {
          const subscriptionEntitlements = await loadSubscriptionEntitlements(authToken);

          if (!cancelled) {
            setEnabledFeatures({
              customers: storedPermissions.includes("*") || storedPermissions.includes("convenios"),
              expenses: storedPermissions.includes("*") || storedPermissions.includes("despesas"),
              employees: storedPermissions.includes("*") || storedPermissions.includes("funcionarios")
            });
            setEntitlements(subscriptionEntitlements);
          }

          return;
        }

        const [configuracao, subscriptionEntitlements] = await Promise.all([
          apiGet<ConfiguracaoSistema>("/configuracoes", { cacheTtlMs: 60_000, token: authToken }),
          loadSubscriptionEntitlements(authToken)
        ]);

        if (!cancelled) {
          setEnabledFeatures({
            customers: Boolean(configuracao.formas_pagamento?.convenio || configuracao.formas_pagamento?.parcelamento),
            expenses: configuracao.lancar_despesas?.ativo === true,
            employees: configuracao.controle_funcionarios?.ativo === true
          });
          setEntitlements(subscriptionEntitlements);
        }
      } catch {
        if (!cancelled) {
          setEnabledFeatures(defaultEnabledSystemFeatures);
          setEntitlements(null);
        }
      }
    }

    void loadConfiguration();

    return () => {
      cancelled = true;
    };
  }, []);

  const routineItems = useMemo(
    () =>
      baseRoutineItems.filter((item) =>
        (!item.requiredFeature || enabledFeatures[item.requiredFeature]) &&
        canUseMenuItem(item, accountType, accountPermissions)
      ),
    [accountPermissions, accountType, enabledFeatures]
  );
  const canUseConfigurationItem = configurationItem
    ? canUseMenuItem(configurationItem, accountType, accountPermissions)
    : false;
  const isFiscalLocked = entitlements !== null && !hasFiscalEntitlement(entitlements);
  const blockedByFiscalPlan = searchParams.get("bloqueio") === "emissao_fiscal";

  return (
    <PlatformFrame>
      <main className="system-home-page">
        <div className="system-home-shell">
          <section className="platform-flow-section-title" aria-label="Meu sistema">
            <span className="platform-flow-section-main">
              <LayoutGrid aria-hidden="true" />
              <strong>Meu sistema</strong>
            </span>
          </section>

          {blockedByFiscalPlan ? (
            <AuthFeedback tone="warning">Seu plano atual não permite recursos fiscais.</AuthFeedback>
          ) : null}

          <section className="system-home-card" aria-label="Menu do meu sistema">
            <nav className="system-home-menu" aria-label="Rotinas do sistema">
              {configurationItem && canUseConfigurationItem ? (
                <div className="system-home-menu-featured">
                  {renderMenuItem(configurationItem, true)}
                </div>
              ) : null}

              {routineItems.length ? (
                <div className="system-home-menu-grid">
                  {routineItems.map((item) =>
                    renderMenuItem(
                      item,
                      false,
                      item.requiredPlanFeature === "emissao_fiscal" && isFiscalLocked
                    )
                  )}
                </div>
              ) : accountType === "subconta" ? (
                <div className="platform-access-empty">
                  <UsersRound aria-hidden="true" size={20} />
                  Nenhum acesso liberado para esta subconta.
                </div>
              ) : null}
            </nav>

          </section>
        </div>
      </main>
    </PlatformFrame>
  );
}
