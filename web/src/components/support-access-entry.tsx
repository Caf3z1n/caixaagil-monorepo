"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, LoaderCircle } from "lucide-react";

import { apiPost } from "@/lib/api-client";
import {
  clearPlatformSession,
  PLATFORM_ACCESS_VALIDATED_AT_STORAGE_KEY,
  PLATFORM_ACCOUNT_EMAIL_STORAGE_KEY,
  PLATFORM_ACCOUNT_PERMISSIONS_STORAGE_KEY,
  PLATFORM_ACCOUNT_TYPE_STORAGE_KEY,
  PLATFORM_AUTH_TOKEN_STORAGE_KEY,
  storePlatformSupportContext
} from "@/lib/platform-session";

type SupportSessionResponse = {
  suporte: {
    administrador_id: number;
    administrador_nome: string;
    expira_em: string;
  };
  token: string;
  user: {
    email: string;
    permissoes?: string[];
    tipo_conta?: "usuario";
  };
};

let pendingSupportExchange: {
  key: string;
  promise: Promise<SupportSessionResponse>;
} | null = null;

function exchangeSupportCode(codigo: string, usuario: string) {
  const key = `${usuario}:${codigo}`;

  if (pendingSupportExchange?.key === key) {
    return pendingSupportExchange.promise;
  }

  const promise = apiPost<SupportSessionResponse>("/sessions/suporte", { codigo, usuario }).catch((error) => {
    if (pendingSupportExchange?.key === key) {
      pendingSupportExchange = null;
    }

    throw error;
  });
  pendingSupportExchange = { key, promise };
  return promise;
}

export function SupportAccessEntry() {
  const router = useRouter();
  const startedRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }

    startedRef.current = true;
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const codigo = fragment.get("codigo");
    const usuario = fragment.get("usuario");

    if (!codigo || !usuario) {
      setErrorMessage("O acesso administrativo está incompleto. Gere um novo código no painel admin.");
      return;
    }

    exchangeSupportCode(codigo, usuario)
      .then((result) => {
        clearPlatformSession();
        window.localStorage.setItem(PLATFORM_ACCOUNT_EMAIL_STORAGE_KEY, result.user.email);
        window.localStorage.setItem(PLATFORM_ACCOUNT_TYPE_STORAGE_KEY, "usuario");
        window.localStorage.setItem(
          PLATFORM_ACCOUNT_PERMISSIONS_STORAGE_KEY,
          JSON.stringify(result.user.permissoes || ["*"])
        );
        window.localStorage.setItem(PLATFORM_AUTH_TOKEN_STORAGE_KEY, result.token);
        window.localStorage.setItem(PLATFORM_ACCESS_VALIDATED_AT_STORAGE_KEY, String(Date.now()));
        storePlatformSupportContext({
          administradorNome: result.suporte.administrador_nome,
          contaEmail: result.user.email,
          expiraEm: result.suporte.expira_em
        });
        router.replace("/meu-sistema");
      })
      .catch((error) => {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Não foi possível iniciar o acesso administrativo."
        );
      });
  }, [router]);

  return (
    <main className="onboarding-page">
      <section className="onboarding-card onboarding-card-compact platform-support-entry-card" aria-live="polite">
        {errorMessage ? (
          <>
            <span className="onboarding-status-icon platform-support-entry-error">
              <AlertTriangle aria-hidden="true" size={24} />
            </span>
            <h1>Acesso não iniciado</h1>
            <p>{errorMessage}</p>
            <Link className="platform-primary-button" href="/">
              Voltar ao início
            </Link>
          </>
        ) : (
          <>
            <span className="onboarding-status-icon">
              <LoaderCircle aria-hidden="true" className="onboarding-spin" size={24} />
            </span>
            <h1>Abrindo conta</h1>
            <p>Validando o código temporário de acesso administrativo.</p>
          </>
        )}
      </section>
    </main>
  );
}
