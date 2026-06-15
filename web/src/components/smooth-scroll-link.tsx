"use client";

import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";

import { smoothScrollToHash } from "@/lib/smooth-scroll";

type SmoothScrollLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
  href: `#${string}`;
};

export function SmoothScrollLink({
  children,
  href,
  onClick,
  ...props
}: SmoothScrollLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);

    if (event.defaultPrevented) {
      return;
    }

    if (smoothScrollToHash(href)) {
      event.preventDefault();
      window.history.pushState(null, "", href);
    }
  }

  return (
    <a href={href} onClick={handleClick} {...props}>
      {children}
    </a>
  );
}
