"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function CashierModal({
  title,
  description,
  headingIcon,
  children,
  footer,
  onClose,
  dismissible = true,
  size = "md"
}: {
  title: string;
  description?: string;
  headingIcon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  dismissible?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (dismissible && event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dismissible, onClose]);

  if (!isMounted) {
    return null;
  }

  return createPortal(
    <div className="pdv-modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && dismissible && onClose()}>
      <section className={`pdv-modal-card pdv-modal-card-${size}`} aria-modal="true" role="dialog">
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
