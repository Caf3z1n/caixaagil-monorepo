"use client";

import { useEffect } from "react";

import { smoothScrollToHash } from "@/lib/smooth-scroll";

export function LandingEffects() {
  useEffect(() => {
    document.documentElement.classList.add("landing-effects-ready");

    const header = document.querySelector<HTMLElement>(".site-header");
    const hero = document.querySelector<HTMLElement>(".hero");
    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const loopElements = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal-loop]"));

    function updateHeaderState() {
      if (!header) {
        return;
      }

      if (document.documentElement.classList.contains("auth-modal-open")) {
        return;
      }

      const isScrolled = window.scrollY > 20;
      const heroBottom = hero ? hero.offsetTop + hero.offsetHeight : 0;
      const isOverLightBackground = hero ? window.scrollY + header.offsetHeight / 2 >= heroBottom : false;

      header.classList.toggle("site-header-scrolled", isScrolled);
      header.classList.toggle("site-header-over-light", isScrolled && isOverLightBackground);
    }

    function updateLoopRevealState() {
      const viewportHeight = window.innerHeight;
      const enterLine = viewportHeight * 0.88;
      const exitLine = viewportHeight * 0.08;

      for (const element of loopElements) {
        const rect = element.getBoundingClientRect();
        const isVisible = rect.top < enterLine && rect.bottom > exitLine;

        element.toggleAttribute("data-visible", isVisible);
      }
    }

    function updateScrollState() {
      updateHeaderState();
      updateLoopRevealState();
    }

    function scheduleScrollStateUpdate() {
      updateScrollState();
      window.requestAnimationFrame(() => {
        updateScrollState();
        window.requestAnimationFrame(updateScrollState);
      });
    }

    function handleSmoothAnchorClick(event: MouseEvent) {
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[data-smooth-scroll]");

      if (!link || !link.hash) {
        return;
      }

      if (smoothScrollToHash(link.hash)) {
        event.preventDefault();
        window.history.pushState(null, "", link.hash);
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const shouldLoop = entry.target.hasAttribute("data-reveal-loop");

          if (entry.isIntersecting) {
            entry.target.setAttribute("data-visible", "true");

            if (!shouldLoop) {
              observer.unobserve(entry.target);
            }
          } else if (shouldLoop) {
            entry.target.removeAttribute("data-visible");
          }
        }
      },
      {
        rootMargin: "0px 0px -12% 0px",
        threshold: 0.16
      }
    );

    for (const element of elements) {
      observer.observe(element);
    }

    scheduleScrollStateUpdate();
    document.addEventListener("click", handleSmoothAnchorClick);
    window.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);

    return () => {
      document.documentElement.classList.remove("landing-effects-ready");
      observer.disconnect();
      document.removeEventListener("click", handleSmoothAnchorClick);
      window.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, []);

  return null;
}
