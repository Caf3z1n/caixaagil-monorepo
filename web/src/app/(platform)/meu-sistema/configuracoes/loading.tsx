import { Settings2 } from "lucide-react";

import { PlatformRouteLoading } from "@/components/platform-route-loading";

export default function ConfiguracoesLoading() {
  return <PlatformRouteLoading icon={Settings2} rows={8} size="compact" title="Configurações" variant="actions" />;
}
