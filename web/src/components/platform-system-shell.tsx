"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { PlatformSystemSidebar } from "./platform-system-sidebar";

type PlatformSystemShellProps = {
  children: ReactNode;
};

export function PlatformSystemShell({ children }: PlatformSystemShellProps) {
  const pathname = usePathname();
  const shouldShowSystemSidebar = pathname === "/home" || pathname.startsWith("/meu-sistema/");

  if (!shouldShowSystemSidebar) {
    return children;
  }

  return (
    <div className="platform-system-layout">
      <PlatformSystemSidebar />
      <div className="platform-system-content">{children}</div>
    </div>
  );
}
