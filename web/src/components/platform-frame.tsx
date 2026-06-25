import type { ReactNode } from "react";

import { PlatformBillingAlert } from "./platform-billing-alert";
import { PlatformHeader } from "./platform-header";
import { PlatformPerformanceWarmup } from "./platform-performance-warmup";

type PlatformFrameProps = {
  children: ReactNode;
};

export function PlatformFrame({ children }: PlatformFrameProps) {
  return (
    <div className="platform-shell">
      <PlatformPerformanceWarmup />
      <PlatformHeader />
      <PlatformBillingAlert />
      {children}
    </div>
  );
}
