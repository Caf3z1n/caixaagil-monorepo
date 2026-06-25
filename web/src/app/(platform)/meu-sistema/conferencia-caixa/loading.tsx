import { ShieldCheck } from "lucide-react";

import { PlatformRouteLoading } from "@/components/platform-route-loading";

export default function ConferenciaCaixaLoading() {
  return <PlatformRouteLoading icon={ShieldCheck} rows={4} size="medium" title="Conferência de caixa" />;
}
