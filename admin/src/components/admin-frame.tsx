import type { ReactNode } from "react";

import { AdminHeader } from "@/components/admin-header";

type AdminFrameProps = {
  children: ReactNode;
};

export function AdminFrame({ children }: AdminFrameProps) {
  return (
    <div className="admin-app-shell">
      <AdminHeader />
      {children}
    </div>
  );
}
