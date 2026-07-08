"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  FileCheck2,
  PackageSearch,
  ReceiptText,
  Settings2,
  ShieldCheck,
  UsersRound,
  WalletCards,
  Warehouse
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

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

type PlatformSystemItem = {
  label: string;
  href?: string;
  icon: LucideIcon;
  permission?: string;
  requiresFiscal?: boolean;
};

type PlatformSystemSection = {
  label: string;
  items: PlatformSystemItem[];
};

const systemSections: PlatformSystemSection[] = [
  {
    label: "Rotinas",
    items: [
      { label: "Configurações", href: "/meu-sistema/configuracoes", icon: Settings2, permission: "configuracoes" },
      { label: "Grupos fiscais", href: "/meu-sistema/grupos-fiscais", icon: FileCheck2, permission: "grupos_fiscais", requiresFiscal: true },
      { label: "Produtos", href: "/meu-sistema/produtos", icon: PackageSearch, permission: "produtos" },
      { label: "Estoque", href: "/meu-sistema/estoque", icon: Warehouse, permission: "estoque" },
      { label: "Conferência de caixa", href: "/meu-sistema/conferencia-caixa", icon: ShieldCheck, permission: "conferencia_caixa" },
      { label: "Funcionários", href: "/meu-sistema/funcionarios", icon: UsersRound, permission: "funcionarios" },
      { label: "Despesas", href: "/meu-sistema/despesas", icon: WalletCards, permission: "despesas" },
      { label: "Clientes", href: "/meu-sistema/convenios", icon: UsersRound, permission: "convenios" },
      { label: "Documentos fiscais", href: "/meu-sistema/documentos-fiscais", icon: ReceiptText, permission: "documentos_fiscais", requiresFiscal: true }
    ]
  }
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
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

function canUseSystemItem(item: PlatformSystemItem, accountType: string, accountPermissions: string[]) {
  if (accountType !== "subconta" || !item.permission) {
    return true;
  }

  return accountPermissions.includes("*") || accountPermissions.includes(item.permission);
}

export function PlatformSystemSidebar() {
  const pathname = usePathname();
  const [entitlements, setEntitlements] = useState<SubscriptionEntitlements | null>(null);
  const [accountType, setAccountType] = useState("usuario");
  const [accountPermissions, setAccountPermissions] = useState<string[]>(["*"]);

  useEffect(() => {
    let cancelled = false;
    const token = getStoredPlatformAuthToken();

    setAccountType(window.localStorage.getItem(PLATFORM_ACCOUNT_TYPE_STORAGE_KEY) || "usuario");
    setAccountPermissions(readStoredPermissions());

    if (!token) {
      return;
    }

    loadSubscriptionEntitlements(token)
      .then((result) => {
        if (!cancelled) {
          setEntitlements(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEntitlements(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const isFiscalLocked = entitlements !== null && !hasFiscalEntitlement(entitlements);
  const visibleSections = systemSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canUseSystemItem(item, accountType, accountPermissions))
    }))
    .filter((section) => section.items.length > 0);

  return (
    <aside className="platform-system-sidebar" aria-label="Menu do meu sistema">
      <div className="platform-system-sidebar-head">
        <strong>Meu sistema</strong>
        <span>Rotinas gerenciais</span>
      </div>

      <nav className="platform-system-menu" aria-label="Rotinas do sistema">
        {visibleSections.map((section) => (
          <section key={section.label} className="platform-system-menu-section">
            <h2>{section.label}</h2>

            <div className="platform-system-menu-list">
              {section.items.map((item) => {
                const Icon = item.icon;
                const lockedByPlan = item.requiresFiscal && isFiscalLocked;

                if (item.href && !lockedByPlan) {
                  const active = isActive(pathname, item.href);

                  return (
                    <Link
                      key={item.label}
                      className={
                        active
                          ? "platform-system-menu-item platform-system-menu-item-active"
                          : "platform-system-menu-item"
                      }
                      href={active ? item.href : buildPlatformReturnHref(item.href, pathname)}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon aria-hidden="true" size={16} />
                      <span>{item.label}</span>
                    </Link>
                  );
                }

                return (
                  <span
                    key={item.label}
                    className="platform-system-menu-item platform-system-menu-item-disabled"
                    aria-disabled="true"
                  >
                    <Icon aria-hidden="true" size={16} />
                    <span>{item.label}</span>
                    {" "}
                    <em>{lockedByPlan ? "Bloqueado" : "Em breve"}</em>
                  </span>
                );
              })}
            </div>
          </section>
        ))}
      </nav>
    </aside>
  );
}

