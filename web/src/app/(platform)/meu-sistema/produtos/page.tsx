import { ProductCatalogManager } from "@/components/product-catalog-manager";
import { PlatformFrame } from "@/components/platform-frame";

export default function MeuSistemaProdutosPage() {
  return (
    <PlatformFrame>
      <ProductCatalogManager />
    </PlatformFrame>
  );
}
