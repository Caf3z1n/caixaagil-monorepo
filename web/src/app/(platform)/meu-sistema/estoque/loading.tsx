import { Warehouse } from "lucide-react";

import { PlatformRouteLoading } from "@/components/platform-route-loading";

export default function EstoqueLoading() {
  return <PlatformRouteLoading icon={Warehouse} rows={4} size="compact" title="Estoque" variant="actions" />;
}
