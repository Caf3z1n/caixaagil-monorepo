"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import { getSafePlatformReturnPath, PLATFORM_RETURN_PARAM } from "@/lib/platform-return";

type PlatformReturnLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  children: ReactNode;
  fallbackHref?: string;
};

export function PlatformReturnLink({
  children,
  fallbackHref = "/meu-sistema",
  ...props
}: PlatformReturnLinkProps) {
  const searchParams = useSearchParams();
  const href = getSafePlatformReturnPath(searchParams.get(PLATFORM_RETURN_PARAM), fallbackHref);

  return (
    <Link {...props} href={href}>
      {children}
    </Link>
  );
}
