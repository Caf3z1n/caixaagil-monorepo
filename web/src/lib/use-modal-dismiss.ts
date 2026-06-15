"use client";

import { useCallback, useEffect, useRef } from "react";
import type { MouseEvent, PointerEvent } from "react";

export function useModalDismiss(isOpen: boolean, onClose: () => void) {
  const shouldCloseOnBackdropClickRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      onClose();
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleBackdropPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    shouldCloseOnBackdropClickRef.current = event.target === event.currentTarget;
  }, []);

  const handleBackdropPointerCancel = useCallback(() => {
    shouldCloseOnBackdropClickRef.current = false;
  }, []);

  const handleBackdropClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (!shouldCloseOnBackdropClickRef.current || event.target !== event.currentTarget) {
        shouldCloseOnBackdropClickRef.current = false;
        return;
      }

      shouldCloseOnBackdropClickRef.current = false;
      onClose();
    },
    [onClose]
  );

  return {
    backdropProps: {
      onClick: handleBackdropClick,
      onPointerCancel: handleBackdropPointerCancel,
      onPointerDown: handleBackdropPointerDown
    }
  };
}
