import { UsersRound } from "lucide-react";

import { PlatformRouteLoading } from "@/components/platform-route-loading";

export default function FuncionariosLoading() {
  return <PlatformRouteLoading icon={UsersRound} rows={5} size="medium" title="Funcionários" />;
}
