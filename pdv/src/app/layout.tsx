import type { Metadata, Viewport } from "next";
import { Sora } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const logoFont = Sora({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-logo",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Caixa Ágil PDV",
  description: "App desktop do Caixa Ágil para ativação e operação do PDV.",
  icons: {
    icon: [
      { url: "./favicon.ico" },
      { url: "./app-icon.png", type: "image/png", sizes: "512x512" }
    ],
    apple: [{ url: "./app-icon.png", type: "image/png", sizes: "512x512" }]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
  themeColor: "#ff6302"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={logoFont.variable}>
        {children}
      </body>
    </html>
  );
}
