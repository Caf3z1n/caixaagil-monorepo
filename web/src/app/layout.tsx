import type { Metadata, Viewport } from "next";
import { Sora } from "next/font/google";
import type { ReactNode } from "react";

import { TextInputFormatProvider } from "@/components/text-input-format-provider";

import "./globals.css";

const logoFont = Sora({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-logo",
  display: "swap"
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://caixaagil.tech"
  ),
  title: {
    default: "Caixa Ágil | PDV para vender, controlar estoque e emitir NF",
    template: "%s | Caixa Ágil"
  },
  description:
    "Landing page comercial do Caixa Ágil, sistema de PDV desktop-first para pequenos comércios com operação offline, estoque, comandas, recebimentos e emissão fiscal opcional.",
  keywords: [
    "Caixa Ágil",
    "PDV",
    "sistema de caixa",
    "NFC-e",
    "estoque",
    "comandas",
    "pequeno comércio"
  ],
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/brand/logo-caixa-agil.png"
  },
  openGraph: {
    title: "Caixa Ágil",
    description:
      "PDV profissional para vender, controlar estoque e escolher entre plano com ou sem emissão fiscal.",
    images: ["/hero/caixa-agil-hardware.png"],
    locale: "pt_BR",
    type: "website"
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
      <head>
        <script src="/landing-history-restore.js" />
      </head>
      <body className={logoFont.variable}>
        <TextInputFormatProvider />
        {children}
      </body>
    </html>
  );
}
