import type { Metadata } from "next";
import type { ReactNode } from "react";

import { PlatformAccessGuard } from "@/components/platform-access-guard";
import { PlatformRouteMotion } from "@/components/platform-route-motion";

export const metadata: Metadata = {
  title: "Plataforma",
  description: "Área inicial da plataforma Caixa Ágil para acompanhar conta, relatórios e subcontas."
};

export default function PlatformLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <PlatformRouteMotion />
      <PlatformAccessGuard>{children}</PlatformAccessGuard>
    </>
  );
}
