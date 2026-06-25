import { FileCheck2 } from "lucide-react";

import { PlatformRouteLoading } from "@/components/platform-route-loading";

export default function GruposFiscaisLoading() {
  return <PlatformRouteLoading icon={FileCheck2} rows={5} title="Grupos fiscais" />;
}
