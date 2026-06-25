"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  FileCheck2,
  HandCoins,
  LayoutGrid,
  Monitor,
  PackageSearch,
  ReceiptText,
  Settings2,
  ShieldCheck,
  UserCircle,
  UsersRound,
  WalletCards,
  Warehouse
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { prefetchPlatformDataForPath } from "@/lib/platform-preload";
import { getStoredPlatformAuthToken } from "@/lib/platform-session";

const ROUTE_ENTER_DURATION_MS = 620;
const ROUTE_PENDING_DELAY_MS = 140;

type PendingRouteMeta = {
  icon: LucideIcon;
  rows?: number;
  size?: "compact" | "medium" | "wide" | "extra-wide";
  title: string;
  variant?: "actions" | "menu" | "flow" | "main";
};

const pendingRouteMeta: Array<{ prefix: string; meta: PendingRouteMeta }> = [
  { prefix: "/meu-sistema/configuracoes", meta: { icon: Settings2, rows: 8, size: "compact", title: "Configurações", variant: "actions" } },
  { prefix: "/meu-sistema/grupos-fiscais", meta: { icon: FileCheck2, rows: 5, title: "Grupos fiscais" } },
  { prefix: "/meu-sistema/produtos", meta: { icon: PackageSearch, rows: 6, title: "Produtos" } },
  { prefix: "/meu-sistema/estoque", meta: { icon: Warehouse, rows: 4, size: "compact", title: "Estoque", variant: "actions" } },
  { prefix: "/meu-sistema/conferencia-caixa", meta: { icon: ShieldCheck, rows: 4, size: "medium", title: "Conferência de caixa" } },
  { prefix: "/meu-sistema/convenios", meta: { icon: HandCoins, rows: 5, size: "medium", title: "Convênios" } },
  { prefix: "/meu-sistema/despesas", meta: { icon: WalletCards, rows: 5, size: "medium", title: "Despesas" } },
  { prefix: "/meu-sistema/documentos-fiscais", meta: { icon: ReceiptText, rows: 5, size: "extra-wide", title: "Documentos fiscais" } },
  { prefix: "/meu-sistema/funcionarios", meta: { icon: UsersRound, rows: 5, size: "medium", title: "Funcionários" } },
  { prefix: "/meu-sistema", meta: { icon: LayoutGrid, title: "Meu sistema", variant: "menu" } },
  { prefix: "/subcontas", meta: { icon: Monitor, rows: 5, size: "medium", title: "PDVs e subcontas" } },
  { prefix: "/conta", meta: { icon: UserCircle, title: "Minha conta", variant: "main" } }
];

function isModifiedClick(event: MouseEvent) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

function getPlatformAnchor(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest<HTMLAnchorElement>(".platform-shell a[href], .platform-flow-page a[href], .system-home-page a[href]");
}

function getInternalRoutePath(anchor: HTMLAnchorElement) {
  if (anchor.target || anchor.hasAttribute("download")) {
    return null;
  }

  const href = anchor.getAttribute("href");

  if (!href || href.startsWith("#")) {
    return null;
  }

  const nextUrl = new URL(href, window.location.href);

  if (nextUrl.origin !== window.location.origin) {
    return null;
  }

  return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
}

function normalizeRoutePath(path: string) {
  try {
    return new URL(path, window.location.href).pathname;
  } catch {
    return path.split("?")[0]?.split("#")[0] ?? path;
  }
}

function getPendingRouteMeta(path: string) {
  const pathname = normalizeRoutePath(path);

  return pendingRouteMeta.find((route) => pathname.startsWith(route.prefix))?.meta ?? {
    icon: LayoutGrid,
    title: "Carregando"
  };
}

function SkeletonLine({ className = "" }: { className?: string }) {
  return <i className={`platform-skeleton-line ${className}`.trim()} />;
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <i className={`platform-skeleton-block ${className}`.trim()} />;
}

function PlatformRoutePendingMenu({ title }: { title: string }) {
  return (
    <div className="system-home-shell platform-loading-shell">
      <section className="system-home-card platform-loading-card" aria-label={`Carregando ${title}`}>
        <div className="platform-loading-featured">
          <SkeletonBlock />
          <span>
            <SkeletonLine />
            <SkeletonLine />
          </span>
          <i className="platform-loading-arrow" />
        </div>

        <div className="platform-loading-grid" aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => (
            <span className="platform-loading-row" key={index}>
              <SkeletonBlock />
              <i>
                <SkeletonLine />
                <SkeletonLine />
              </i>
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

function PlatformRoutePendingMain({ icon: Icon, title }: PendingRouteMeta) {
  return (
    <div className="platform-main platform-route-loading-main platform-route-pending-main">
      <section className="platform-page-heading">
        <div>
          <span className="platform-page-kicker">{title}</span>
          <h1>Carregando dados</h1>
          <p>A estrutura da página está pronta enquanto os dados entram.</p>
        </div>

        <span className="platform-state-pill platform-state-pill-muted">
          <Icon aria-hidden="true" size={18} />
          Preparando
        </span>
      </section>

      <section className="platform-filter-panel platform-route-main-filter" aria-hidden="true">
        <span>
          <SkeletonLine />
          <SkeletonBlock />
        </span>
        <span>
          <SkeletonLine />
          <SkeletonBlock />
        </span>
        <SkeletonBlock />
      </section>
    </div>
  );
}

function PlatformRoutePendingActions({ icon: Icon, rows = 4, size = "compact", title }: PendingRouteMeta) {
  const shellSizeClass =
    size === "compact"
      ? "platform-flow-shell-compact"
      : size === "medium"
        ? "platform-loading-flow-shell-medium"
        : size === "extra-wide"
          ? "platform-loading-flow-shell-extra-wide"
          : "";

  return (
    <div className={`platform-flow-shell platform-loading-shell platform-loading-flow-shell ${shellSizeClass}`.trim()}>
      <section className="platform-flow-section-title" aria-label={title}>
        <span className="platform-flow-section-main">
          <Icon aria-hidden="true" size={24} />
          <strong>{title}</strong>
        </span>
      </section>

      <section className="platform-flow-card platform-loading-card platform-loading-flow-card" aria-label={`Carregando ${title}`}>
        <div className="platform-flow-panel platform-loading-flow-panel">
          <header className="platform-flow-head platform-loading-flow-head">
            <span>
              <SkeletonLine className="platform-loading-heading-line" />
              <SkeletonLine className="platform-loading-copy-line" />
            </span>
          </header>

          <div className="platform-loading-action-list" aria-hidden="true">
            {Array.from({ length: rows }, (_, index) => (
              <span className="platform-loading-action-row" key={index}>
                <SkeletonBlock />
                <i>
                  <SkeletonLine />
                  <SkeletonLine />
                </i>
                <span className="platform-loading-arrow" />
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function PlatformRoutePendingFlow({ icon: Icon, rows = 5, size = "wide", title }: PendingRouteMeta) {
  const shellSizeClass =
    size === "compact"
      ? "platform-flow-shell-compact"
      : size === "medium"
        ? "platform-loading-flow-shell-medium"
        : size === "extra-wide"
          ? "platform-loading-flow-shell-extra-wide"
          : "";

  return (
    <div className={`platform-flow-shell platform-loading-shell platform-loading-flow-shell ${shellSizeClass}`.trim()}>
      <section className="platform-flow-section-title" aria-label={title}>
        <span className="platform-flow-section-main">
          <Icon aria-hidden="true" size={24} />
          <strong>{title}</strong>
        </span>
      </section>

      <section className="platform-flow-card platform-loading-card platform-loading-flow-card" aria-label={`Carregando ${title}`}>
        <div className="platform-flow-panel platform-loading-flow-panel">
          <header className="platform-flow-head platform-loading-flow-head">
            <span>
              <SkeletonLine className="platform-loading-heading-line" />
              <SkeletonLine className="platform-loading-copy-line" />
            </span>
            <SkeletonBlock className="platform-loading-pill" />
          </header>

          <div className="platform-loading-toolbar" aria-hidden="true">
            <span>
              <SkeletonLine />
              <SkeletonBlock />
            </span>
            <span>
              <SkeletonLine />
              <SkeletonBlock />
            </span>
            <SkeletonBlock />
          </div>

          <div className="platform-loading-list" aria-hidden="true">
            {Array.from({ length: rows }, (_, index) => (
              <span className="platform-loading-list-row" key={index}>
                <SkeletonBlock />
                <i>
                  <SkeletonLine />
                  <SkeletonLine />
                </i>
                <SkeletonLine />
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function PlatformRoutePending({ path }: { path: string }) {
  const meta = getPendingRouteMeta(path);

  return (
    <main
      className={meta.variant === "main" ? "platform-route-pending platform-route-pending-light" : "platform-route-pending"}
      aria-busy="true"
      aria-live="polite"
    >
      {meta.variant === "menu" ? (
        <PlatformRoutePendingMenu title={meta.title} />
      ) : meta.variant === "actions" ? (
        <PlatformRoutePendingActions {...meta} />
      ) : meta.variant === "main" ? (
        <PlatformRoutePendingMain {...meta} />
      ) : (
        <PlatformRoutePendingFlow {...meta} />
      )}
    </main>
  );
}

export function PlatformRouteMotion() {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const pendingTimerRef = useRef<number | null>(null);
  const prefetchedRoutesRef = useRef(new Set<string>());

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (pendingTimerRef.current) {
      window.clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    setPendingPath(null);
    root.classList.remove("platform-route-transitioning");
    document
      .querySelectorAll<HTMLElement>("[data-platform-link-exiting]")
      .forEach((element) => delete element.dataset.platformLinkExiting);
    root.dataset.platformRouteEnter = "true";

    const timeout = window.setTimeout(() => {
      delete root.dataset.platformRouteEnter;
      delete root.dataset.platformRouteMotion;
    }, ROUTE_ENTER_DURATION_MS);

    return () => window.clearTimeout(timeout);
  }, [pathname]);

  useEffect(() => {
    function clearPendingTimer() {
      if (pendingTimerRef.current) {
        window.clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
    }

    function prefetchAnchor(anchor: HTMLAnchorElement) {
      const nextPath = getInternalRoutePath(anchor);

      if (!nextPath || prefetchedRoutesRef.current.has(nextPath)) {
        return;
      }

      prefetchedRoutesRef.current.add(nextPath);
      router.prefetch(nextPath);
      void Promise.all(prefetchPlatformDataForPath(nextPath, getStoredPlatformAuthToken()));
    }

    function handleLinkIntent(event: MouseEvent | FocusEvent) {
      const anchor = getPlatformAnchor(event.target);

      if (anchor) {
        prefetchAnchor(anchor);
      }
    }

    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || isModifiedClick(event)) {
        return;
      }

      const anchor = getPlatformAnchor(event.target);

      if (!anchor) {
        return;
      }

      const nextPath = getInternalRoutePath(anchor);

      if (!nextPath) {
        return;
      }

      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;

      if (nextPath === currentPath) {
        return;
      }

      prefetchAnchor(anchor);
      clearPendingTimer();
      pendingTimerRef.current = window.setTimeout(() => {
        setPendingPath(nextPath);
      }, ROUTE_PENDING_DELAY_MS);
    }

    document.addEventListener("pointerover", handleLinkIntent, true);
    document.addEventListener("focusin", handleLinkIntent, true);
    document.addEventListener("click", handleClick, true);

    return () => {
      clearPendingTimer();
      document.removeEventListener("pointerover", handleLinkIntent, true);
      document.removeEventListener("focusin", handleLinkIntent, true);
      document.removeEventListener("click", handleClick, true);
    };
  }, [router]);

  return pendingPath ? <PlatformRoutePending path={pendingPath} /> : null;
}
