import { Monitor } from "lucide-react";

import { PlatformRouteLoading } from "@/components/platform-route-loading";

export default function SubcontasLoading() {
  return <PlatformRouteLoading icon={Monitor} rows={5} size="medium" title="PDVs e subcontas" />;
}
