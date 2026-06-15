"use client";

import { useEffect } from "react";

let activePlatformModalLocks = 0;
let previousHtmlOverflow = "";
let previousBodyOverflow = "";
let previousHtmlOverscrollBehavior = "";
let previousBodyOverscrollBehavior = "";

export function usePlatformModalScrollLock(isOpen: boolean) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const root = document.documentElement;
    const body = document.body;

    if (activePlatformModalLocks === 0) {
      previousHtmlOverflow = root.style.overflow;
      previousBodyOverflow = body.style.overflow;
      previousHtmlOverscrollBehavior = root.style.overscrollBehavior;
      previousBodyOverscrollBehavior = body.style.overscrollBehavior;

      root.classList.add("platform-modal-open");
      root.style.overflow = "hidden";
      root.style.overscrollBehavior = "none";
      body.style.overflow = "hidden";
      body.style.overscrollBehavior = "none";
    }

    activePlatformModalLocks += 1;

    return () => {
      activePlatformModalLocks = Math.max(0, activePlatformModalLocks - 1);

      if (activePlatformModalLocks === 0) {
        root.classList.remove("platform-modal-open");
        root.style.overflow = previousHtmlOverflow;
        root.style.overscrollBehavior = previousHtmlOverscrollBehavior;
        body.style.overflow = previousBodyOverflow;
        body.style.overscrollBehavior = previousBodyOverscrollBehavior;
      }
    };
  }, [isOpen]);
}
