import type { LucideIcon } from "lucide-react";
import { ArrowLeft, ArrowRight, LayoutGrid } from "lucide-react";

import { PlatformFrame } from "./platform-frame";

type PlatformRouteLoadingVariant = "actions" | "menu" | "flow" | "main";

type PlatformRouteLoadingProps = {
  title: string;
  icon: LucideIcon;
  variant?: PlatformRouteLoadingVariant;
  rows?: number;
  size?: "compact" | "medium" | "wide" | "extra-wide";
};

function SkeletonLine({ className = "" }: { className?: string }) {
  return <i className={`platform-skeleton-line ${className}`.trim()} />;
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <i className={`platform-skeleton-block ${className}`.trim()} />;
}

function PlatformRouteMenuLoading({ title }: { title: string }) {
  return (
    <PlatformFrame>
      <main className="system-home-page platform-loading-page platform-route-loading-menu" aria-busy="true" aria-live="polite">
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

function PlatformRouteMainLoading({ title, icon: Icon }: { title: string; icon: LucideIcon }) {
  return (
    <PlatformFrame>
      <main className="platform-main platform-route-loading-main" aria-busy="true" aria-live="polite">
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

        <section className="platform-report-grid platform-route-main-grid" aria-hidden="true">
          {Array.from({ length: 4 }, (_, index) => (
            <article className="platform-report-card platform-route-main-card" key={index}>
              <SkeletonBlock />
              <span>
                <SkeletonLine />
                <SkeletonLine />
              </span>
              <SkeletonLine />
            </article>
          ))}
        </section>
      </main>
    </PlatformFrame>
  );
}

function PlatformRouteActionsLoading({
  title,
  icon: Icon,
  rows = 4,
  size = "compact"
}: {
  title: string;
  icon: LucideIcon;
  rows?: number;
  size?: PlatformRouteLoadingProps["size"];
}) {
  const shellSizeClass =
    size === "compact"
      ? "platform-flow-shell-compact"
      : size === "medium"
        ? "platform-loading-flow-shell-medium"
        : size === "extra-wide"
          ? "platform-loading-flow-shell-extra-wide"
          : "";

  return (
    <PlatformFrame>
      <main className="platform-flow-page platform-loading-page platform-route-loading-flow" aria-busy="true" aria-live="polite">
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

export function PlatformRouteLoading({
  title,
  icon: Icon,
  variant = "flow",
  rows = 5,
  size = "wide"
}: PlatformRouteLoadingProps) {
  if (variant === "menu") {
    return <PlatformRouteMenuLoading title={title} />;
  }

  if (variant === "actions") {
    return <PlatformRouteActionsLoading icon={Icon} rows={rows} size={size} title={title} />;
  }

  if (variant === "main") {
    return <PlatformRouteMainLoading icon={Icon} title={title} />;
  }

  const shellSizeClass =
    size === "compact"
      ? "platform-flow-shell-compact"
      : size === "medium"
        ? "platform-loading-flow-shell-medium"
        : size === "extra-wide"
          ? "platform-loading-flow-shell-extra-wide"
          : "";

  return (
    <PlatformFrame>
      <main className="platform-flow-page platform-loading-page platform-route-loading-flow" aria-busy="true" aria-live="polite">
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

            <div className="platform-flow-actions platform-loading-actions" aria-hidden="true">
              <span className="platform-secondary-button platform-loading-button">
                <ArrowLeft size={16} />
                <SkeletonLine />
              </span>
              <span className="platform-primary-button platform-loading-button">
                <SkeletonLine />
                <ArrowRight size={16} />
              </span>
            </div>

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

export function PlatformMenuRouteLoading() {
  return <PlatformRouteLoading icon={LayoutGrid} title="Meu sistema" variant="menu" />;
}
