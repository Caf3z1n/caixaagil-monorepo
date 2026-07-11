import type { Metadata } from "next";

import { SupportAccessEntry } from "@/components/support-access-entry";

export const metadata: Metadata = {
  title: "Acesso administrativo"
};

export default function SupportAccessPage() {
  return <SupportAccessEntry />;
}
