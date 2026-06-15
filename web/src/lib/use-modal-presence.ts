"use client";

import { useEffect, useState } from "react";

export type ModalPresenceState = "open" | "closing";

const DEFAULT_MODAL_EXIT_DURATION_MS = 180;

export function useModalPresence<T>(
  value: T | null | false | undefined,
  exitDurationMs = DEFAULT_MODAL_EXIT_DURATION_MS
) {
  const isOpen = Boolean(value);
  const [isPresent, setIsPresent] = useState(isOpen);
  const [presentValue, setPresentValue] = useState(value);

  useEffect(() => {
    if (isOpen) {
      setPresentValue(value);
      setIsPresent(true);
      return;
    }

    if (!isPresent) {
      setPresentValue(value);
      return;
    }

    const timeout = window.setTimeout(() => {
      setIsPresent(false);
      setPresentValue(value);
    }, exitDurationMs);

    return () => window.clearTimeout(timeout);
  }, [exitDurationMs, isOpen, isPresent, value]);

  return {
    isPresent,
    presentValue,
    state: (isOpen ? "open" : "closing") as ModalPresenceState
  };
}
