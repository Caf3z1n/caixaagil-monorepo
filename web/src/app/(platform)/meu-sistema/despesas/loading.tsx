import { WalletCards } from "lucide-react";

import { PlatformRouteLoading } from "@/components/platform-route-loading";

export default function DespesasLoading() {
  return <PlatformRouteLoading icon={WalletCards} rows={5} size="medium" title="Despesas" />;
}
