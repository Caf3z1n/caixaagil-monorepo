import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Caixa Ágil | Administrativo",
    template: "%s | Caixa Ágil Administrativo"
  },
  description: "Painel interno para gestão administrativa do Caixa Ágil.",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "oklch(0.71 0.2 45)"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
