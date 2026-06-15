"use client";

import Link from "next/link";
import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode, type Ref } from "react";

type ActionButtonVariant = "primary" | "secondary";

type SharedActionButtonProps = {
  children: ReactNode;
  className?: string;
  variant?: ActionButtonVariant;
};

type ActionButtonLinkProps = SharedActionButtonProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
  };

type ActionButtonButtonProps = SharedActionButtonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: never;
  };

type ActionButtonProps = ActionButtonLinkProps | ActionButtonButtonProps;

function getActionButtonClassName(variant: ActionButtonVariant | undefined, className: string | undefined) {
  return [variant ? `app-action app-action-${variant}` : null, className].filter(Boolean).join(" ");
}

export const ActionButton = forwardRef<HTMLButtonElement | HTMLAnchorElement, ActionButtonProps>(function ActionButton(
  { children, className, variant, ...props },
  ref
) {
  const actionClassName = getActionButtonClassName(variant, className);

  if ("href" in props && typeof props.href === "string") {
    const { href, ...linkProps } = props as Omit<ActionButtonLinkProps, keyof SharedActionButtonProps>;

    return (
      <Link className={actionClassName} href={href} ref={ref as Ref<HTMLAnchorElement>} {...linkProps}>
        {children}
      </Link>
    );
  }

  const buttonProps = props as Omit<ActionButtonButtonProps, keyof SharedActionButtonProps>;

  return (
    <button className={actionClassName} ref={ref as Ref<HTMLButtonElement>} {...buttonProps}>
      {children}
    </button>
  );
});
