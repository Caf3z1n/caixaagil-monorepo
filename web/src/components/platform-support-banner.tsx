"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, ShieldCheck } from "lucide-react";

import {
  clearPlatformSession,
  getStoredPlatformSupportContext,
  type PlatformSupportContext
} from "@/lib/platform-session";

function formatRemainingTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function PlatformSupportBanner() {
  const router = useRouter();
  const [context, setContext] = useState<PlatformSupportContext | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  useEffect(() => {
    const storedContext = getStoredPlatformSupportContext();

    if (!storedContext) {
      return undefined;
    }

    const activeContext = storedContext;

    setContext(activeContext);

    function updateRemainingTime() {
      const nextSeconds = Math.max(
        0,
        Math.ceil((new Date(activeContext.expiraEm).getTime() - Date.now()) / 1000)
      );

      setSecondsRemaining(nextSeconds);

      if (nextSeconds <= 0) {
        clearPlatformSession();
        router.replace("/");
      }
    }

    updateRemainingTime();
    const intervalId = window.setInterval(updateRemainingTime, 1000);

    return () => window.clearInterval(intervalId);
  }, [router]);

  if (!context) {
    return null;
  }

  return (
    <div className="platform-support-band" role="status">
      <section className="platform-support-banner">
        <ShieldCheck aria-hidden="true" size={18} />
        <span>
          <strong>Acesso administrativo</strong>
          <small>{context.contaEmail} · iniciado por {context.administradorNome}</small>
        </span>
        <em>Encerra em {formatRemainingTime(secondsRemaining)}</em>
        <button
          type="button"
          onClick={() => {
            clearPlatformSession();
            router.replace("/");
          }}
        >
          <LogOut aria-hidden="true" size={15} />
          Encerrar
        </button>
      </section>
    </div>
  );
}
