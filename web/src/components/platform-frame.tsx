import type { ReactNode } from "react";

import { PlatformHeader } from "./platform-header";

type PlatformFrameProps = {
  children: ReactNode;
};

export function PlatformFrame({ children }: PlatformFrameProps) {
  return (
    <div className="platform-shell">
      <PlatformHeader />
      {children}
    </div>
  );
}
