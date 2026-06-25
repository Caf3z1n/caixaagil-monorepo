import { ReceiptText } from "lucide-react";

import { PlatformRouteLoading } from "@/components/platform-route-loading";

export default function DocumentosFiscaisLoading() {
  return <PlatformRouteLoading icon={ReceiptText} rows={5} size="extra-wide" title="Documentos fiscais" />;
}
