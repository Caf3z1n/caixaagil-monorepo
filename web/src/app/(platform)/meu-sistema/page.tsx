"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FocusEvent, PointerEvent } from "react";
import {
  ArrowRight,
  FileCheck2,
  HandCoins,
  LayoutGrid,
  PackageSearch,
  ReceiptText,
  Settings2,
  ShieldCheck,
  Warehouse
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { PlatformFrame } from "@/components/platform-frame";
import { apiGet } from "@/lib/api-client";
import { getStoredPlatformAuthToken } from "@/lib/platform-session";

type SystemMenuItem = {
  title: string;
  href?: string;
  icon: LucideIcon;
  requiresConvenio?: boolean;
};

type ConfiguracaoSistema = {
  formas_pagamento?: {
    convenio?: boolean;
  } | null;
};

const menuItems: SystemMenuItem[] = [
  {
    title: "Grupos fiscais",
    href: "/meu-sistema/grupos-fiscais",
    icon: FileCheck2
  },
  {
    title: "Produtos",
    href: "/meu-sistema/produtos",
    icon: PackageSearch
  },
  {
    title: "Estoque",
    href: "/meu-sistema/estoque",
    icon: Warehouse
  },
  {
    title: "Conferência de caixa",
    href: "/meu-sistema/conferencia-caixa",
    icon: ShieldCheck
  },
  {
    title: "Configurações",
    href: "/meu-sistema/configuracoes",
    icon: Settings2
  },
  {
    title: "Convênios",
    href: "/meu-sistema/convenios",
    icon: HandCoins,
    requiresConvenio: true
  },
  {
    title: "Documentos fiscais",
    icon: ReceiptText
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

function renderMenuItem(item: SystemMenuItem, featured = false) {
  const Icon = item.icon;

  if (!item.href) {
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
        <span className="system-home-menu-status">Em breve</span>
      </span>
    );
  }

  const itemClassName = featured
    ? "system-home-menu-item system-home-menu-item-featured"
    : "system-home-menu-item";

  return (
    <Link
      className={itemClassName}
      href={item.href}
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
  const [isConvenioEnabled, setIsConvenioEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const token = getStoredPlatformAuthToken();

    if (!token) {
      return;
    }

    async function loadConfiguration() {
      try {
        const configuracao = await apiGet<ConfiguracaoSistema>("/configuracoes", { token });

        if (!cancelled) {
          setIsConvenioEnabled(Boolean(configuracao.formas_pagamento?.convenio));
        }
      } catch {
        if (!cancelled) {
          setIsConvenioEnabled(false);
        }
      }
    }

    void loadConfiguration();

    return () => {
      cancelled = true;
    };
  }, []);

  const routineItems = useMemo(
    () => baseRoutineItems.filter((item) => !item.requiresConvenio || isConvenioEnabled),
    [isConvenioEnabled]
  );

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

          <section className="system-home-card" aria-label="Menu do meu sistema">
            <nav className="system-home-menu" aria-label="Rotinas do sistema">
              {configurationItem ? (
                <div className="system-home-menu-featured">
                  {renderMenuItem(configurationItem, true)}
                </div>
              ) : null}

              <div className="system-home-menu-grid">
                {routineItems.map((item) => renderMenuItem(item))}
              </div>
            </nav>

            <div className="platform-flow-progress" aria-hidden="true">
              <span className="platform-flow-progress-bar platform-flow-progress-bar-active" />
              <span className="platform-flow-progress-bar" />
              <span className="platform-flow-progress-bar" />
            </div>
          </section>
        </div>
      </main>
    </PlatformFrame>
  );
}
