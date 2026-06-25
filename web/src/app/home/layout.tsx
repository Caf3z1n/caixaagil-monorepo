import type { Metadata } from "next";
import type { ReactNode } from "react";

import { PlatformAccessGuard } from "@/components/platform-access-guard";

export const metadata: Metadata = {
  title: "Plataforma",
  description: "Área inicial da plataforma Caixa Ágil para acompanhar conta, PDVs e subcontas."
};

export default function PlatformLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <PlatformAccessGuard>{children}</PlatformAccessGuard>;
}
