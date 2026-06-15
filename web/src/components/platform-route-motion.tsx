"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect } from "react";

const ROUTE_EXIT_DELAY_MS = 205;
const ROUTE_ENTER_DURATION_MS = 620;

function isModifiedClick(event: MouseEvent) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

function getPlatformAnchor(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest<HTMLAnchorElement>(".platform-shell a[href], .platform-flow-page a[href], .system-home-page a[href]");
}

export function PlatformRouteMotion() {
  const pathname = usePathname();
  const router = useRouter();

  useLayoutEffect(() => {
    const root = document.documentElement;
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
    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || isModifiedClick(event)) {
        return;
      }

      const anchor = getPlatformAnchor(event.target);

      if (!anchor || anchor.target || anchor.hasAttribute("download")) {
        return;
      }

      const href = anchor.getAttribute("href");

      if (!href || href.startsWith("#")) {
        return;
      }

      const nextUrl = new URL(href, window.location.href);

      if (nextUrl.origin !== window.location.origin) {
        return;
      }

      const nextPath = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;

      if (nextPath === currentPath) {
        return;
      }

      event.preventDefault();

      const root = document.documentElement;
      root.dataset.platformRouteMotion = "forward";
      root.classList.add("platform-route-transitioning");
      anchor.dataset.platformLinkExiting = "true";

      window.setTimeout(() => {
        router.push(nextPath);
      }, ROUTE_EXIT_DELAY_MS);
    }

    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, [router]);

  return null;
}
