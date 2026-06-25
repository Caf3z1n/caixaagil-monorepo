import { PackageSearch } from "lucide-react";

import { PlatformRouteLoading } from "@/components/platform-route-loading";

export default function ProdutosLoading() {
  return <PlatformRouteLoading icon={PackageSearch} rows={6} title="Produtos" />;
}
