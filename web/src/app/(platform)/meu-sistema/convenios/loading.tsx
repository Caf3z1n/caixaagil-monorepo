import { HandCoins } from "lucide-react";

import { PlatformRouteLoading } from "@/components/platform-route-loading";

export default function ConveniosLoading() {
  return <PlatformRouteLoading icon={HandCoins} rows={5} size="medium" title="Convênios" />;
}
