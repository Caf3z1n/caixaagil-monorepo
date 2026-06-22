"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileCheck2,
  HandCoins,
  PackageSearch,
  ReceiptText,
  Settings2,
  ShieldCheck,
  UsersRound,
  Warehouse
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type PlatformSystemItem = {
  label: string;
  href?: string;
  icon: LucideIcon;
};

type PlatformSystemSection = {
  label: string;
  items: PlatformSystemItem[];
};

const systemSections: PlatformSystemSection[] = [
  {
    label: "Rotinas",
    items: [
      { label: "Grupos fiscais", href: "/meu-sistema/grupos-fiscais", icon: FileCheck2 },
      { label: "Produtos", href: "/meu-sistema/produtos", icon: PackageSearch },
      { label: "Estoque", href: "/meu-sistema/estoque", icon: Warehouse },
      { label: "Conferência de caixa", icon: ShieldCheck },
      { label: "Configurações", href: "/meu-sistema/configuracoes", icon: Settings2 },
      { label: "Clientes", icon: UsersRound },
      { label: "Recebimentos", icon: HandCoins },
      { label: "Documentos fiscais", href: "/meu-sistema/documentos-fiscais", icon: ReceiptText }
    ]
  }
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PlatformSystemSidebar() {
  const pathname = usePathname();

  return (
    <aside className="platform-system-sidebar" aria-label="Menu do meu sistema">
      <div className="platform-system-sidebar-head">
        <strong>Meu sistema</strong>
        <span>Rotinas gerenciais</span>
      </div>

      <nav className="platform-system-menu" aria-label="Rotinas do sistema">
        {systemSections.map((section) => (
          <section key={section.label} className="platform-system-menu-section">
            <h2>{section.label}</h2>

            <div className="platform-system-menu-list">
              {section.items.map((item) => {
                const Icon = item.icon;

                if (item.href) {
                  const active = isActive(pathname, item.href);

                  return (
                    <Link
                      key={item.label}
                      className={
                        active
                          ? "platform-system-menu-item platform-system-menu-item-active"
                          : "platform-system-menu-item"
                      }
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon aria-hidden="true" size={16} />
                      <span>{item.label}</span>
                    </Link>
                  );
                }

                return (
                  <span
                    key={item.label}
                    className="platform-system-menu-item platform-system-menu-item-disabled"
                    aria-disabled="true"
                  >
                    <Icon aria-hidden="true" size={16} />
                    <span>{item.label}</span>
                    {" "}
                    <em>Em breve</em>
                  </span>
                );
              })}
            </div>
          </section>
        ))}
      </nav>
    </aside>
  );
}

