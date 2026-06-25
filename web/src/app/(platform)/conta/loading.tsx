import { UserCircle } from "lucide-react";

import { PlatformRouteLoading } from "@/components/platform-route-loading";

export default function ContaLoading() {
  return <PlatformRouteLoading icon={UserCircle} title="Minha conta" variant="main" />;
}
