"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CreditCard, LayoutGrid, LogOut } from "lucide-react";

import { clearAdminSession } from "@/lib/admin-session";

const navItems = [
  { href: "/planos", label: "Planos", icon: CreditCard },
  { href: "/usuarios", label: "Contas", icon: LayoutGrid }
];

export function AdminHeader() {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    clearAdminSession();
    router.replace("/");
  }

  return (
    <aside className="admin-sidebar" aria-label="Navegação administrativa">
      <Link className="admin-sidebar-brand" href="/planos" aria-label="Caixa Ágil Administrativo">
        <Image alt="" src="/brand/logo-caixa-agil.png" width={46} height={46} priority />
        <span>Caixa Ágil</span>
      </Link>

      <nav className="admin-sidebar-nav" aria-label="Seções administrativas">
        {navItems.map(item => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              className={isActive ? "admin-sidebar-link admin-sidebar-link-active" : "admin-sidebar-link"}
              href={item.href}
            >
              <Icon aria-hidden="true" size={24} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <button className="admin-sidebar-logout" type="button" onClick={handleLogout}>
        <LogOut aria-hidden="true" size={25} />
        <span>Sair</span>
      </button>
    </aside>
  );
}
