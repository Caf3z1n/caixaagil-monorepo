"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";

import {
  clearPlatformSession,
  PLATFORM_ACCOUNT_PERMISSIONS_STORAGE_KEY,
  PLATFORM_ACCOUNT_TYPE_STORAGE_KEY
} from "@/lib/platform-session";

type PlatformNavItem = {
  href: string;
  label: string;
  permission?: string;
};

const platformNavItems: PlatformNavItem[] = [
  { href: "/meu-sistema", label: "Meu sistema" },
  { href: "/conta", label: "Minha conta" }
];

function isItemActive(pathname: string, item: PlatformNavItem) {
  if (item.href === "/meu-sistema") {
    return (
      pathname === "/meu-sistema" ||
      pathname === "/conferencia-caixa" ||
      pathname === "/home" ||
      pathname.startsWith("/meu-sistema/") ||
      pathname.startsWith("/grupos-fiscais") ||
      pathname.startsWith("/produtos") ||
      pathname.startsWith("/estoque") ||
      pathname === "/inicio"
    );
  }

  return pathname.startsWith(item.href);
}

function canUseItem(item: PlatformNavItem, accountType: string, accountPermissions: string[]) {
  if (accountType !== "subconta" || !item.permission) {
    return true;
  }

  return accountPermissions.includes("*") || accountPermissions.includes(item.permission);
}

function isOverLightPlatformSurface(pathname: string) {
  return (
    pathname === "/conferencia-caixa" ||
    pathname.startsWith("/home")
  );
}

export function PlatformHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [accountType, setAccountType] = useState("usuario");
  const [accountPermissions, setAccountPermissions] = useState<string[]>(["*"]);

  useEffect(() => {
    const storedType = window.localStorage.getItem(PLATFORM_ACCOUNT_TYPE_STORAGE_KEY);
    const storedPermissions = window.localStorage.getItem(PLATFORM_ACCOUNT_PERMISSIONS_STORAGE_KEY);

    if (storedType) {
      setAccountType(storedType);
    }

    if (storedPermissions) {
      try {
        const parsed = JSON.parse(storedPermissions);
        setAccountPermissions(Array.isArray(parsed) ? parsed : ["*"]);
      } catch {
        setAccountPermissions(["*"]);
      }
    }
  }, []);

  const visibleNavItems = platformNavItems.filter((item) =>
    canUseItem(item, accountType, accountPermissions)
  );

  useEffect(() => {
    visibleNavItems.forEach((item) => router.prefetch(item.href));
  }, [router, visibleNavItems]);

  const headerClassName = isOverLightPlatformSurface(pathname)
    ? "site-header site-header-scrolled site-header-over-light platform-header platform-header-over-light"
    : "site-header platform-header";

  return (
    <header
      className={headerClassName}
      aria-label="Navegação da plataforma"
    >
      <Link className="brand-mark platform-brand" href="/meu-sistema" aria-label="Caixa Ágil">
        <Image
          src="/brand/logo-caixa-agil.png"
          alt=""
          width={52}
          height={52}
          priority
        />
        <span>CAIXA ÁGIL</span>
      </Link>

      <nav className="platform-primary-nav" aria-label="Páginas principais da plataforma">
        {visibleNavItems.map((item) => {
          const isActive = isItemActive(pathname, item);

          return (
            <Link
              key={item.href}
              className={
                isActive
                  ? "platform-primary-nav-link platform-primary-nav-link-active"
                  : "platform-primary-nav-link"
              }
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              onFocus={() => router.prefetch(item.href)}
              onMouseEnter={() => router.prefetch(item.href)}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <Link
        className="platform-logout-action"
        href="/"
        onClick={() => {
          clearPlatformSession();
        }}
      >
        <LogOut aria-hidden="true" size={17} />
        Desconectar
      </Link>
    </header>
  );
}

