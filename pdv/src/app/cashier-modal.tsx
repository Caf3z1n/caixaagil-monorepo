"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const activeModalIds: string[] = [];
let lockedModalCount = 0;
let previousHtmlOverflow = "";
let previousBodyOverflow = "";

function addActiveModal(id: string) {
  if (!activeModalIds.includes(id)) {
    activeModalIds.push(id);
  }
}

function removeActiveModal(id: string) {
  const index = activeModalIds.lastIndexOf(id);

  if (index >= 0) {
    activeModalIds.splice(index, 1);
  }
}

function isTopActiveModal(id: string) {
  return activeModalIds.at(-1) === id;
}

function blurActiveElement() {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

function lockPageScroll() {
  if (lockedModalCount === 0) {
    previousHtmlOverflow = document.documentElement.style.overflow;
    previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  }

  lockedModalCount += 1;
}

function unlockPageScroll() {
  lockedModalCount = Math.max(0, lockedModalCount - 1);

  if (lockedModalCount === 0) {
    document.documentElement.style.overflow = previousHtmlOverflow;
    document.body.style.overflow = previousBodyOverflow;
    previousHtmlOverflow = "";
    previousBodyOverflow = "";
  }
}

export function CashierModal({
  title,
  description,
  headingIcon,
  children,
  className,
  footer,
  onClose,
  dismissible = true,
  size = "md"
}: {
  title: string;
  description?: string;
  headingIcon?: ReactNode;
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
  onClose: () => void;
  dismissible?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const modalId = useId();
  const dismissibleRef = useRef(dismissible);
  const onCloseRef = useRef(onClose);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    dismissibleRef.current = dismissible;
    onCloseRef.current = onClose;
  }, [dismissible, onClose]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    addActiveModal(modalId);
    lockPageScroll();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dismissibleRef.current && isTopActiveModal(modalId)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        blurActiveElement();
        onCloseRef.current();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      removeActiveModal(modalId);
      unlockPageScroll();
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [modalId]);

  if (!isMounted) {
    return null;
  }

  return createPortal(
    <div className="pdv-modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && dismissible && onClose()}>
      <section className={`pdv-modal-card pdv-modal-card-${size}${className ? ` ${className}` : ""}`} aria-modal="true" role="dialog">
        {dismissible ? (
          <button className="pdv-modal-close" type="button" onClick={onClose} aria-label="Fechar modal">
            <X aria-hidden="true" size={19} />
          </button>
        ) : null}
        <header className={headingIcon ? "pdv-modal-head pdv-modal-head-with-icon" : "pdv-modal-head"}>
          {headingIcon ? <span className="pdv-modal-head-icon">{headingIcon}</span> : null}
          <span className="pdv-modal-head-copy">
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </span>
        </header>
        <div className="pdv-modal-body">{children}</div>
        {footer ? <footer className="pdv-modal-footer">{footer}</footer> : null}
      </section>
    </div>,
    document.body
  );
}
