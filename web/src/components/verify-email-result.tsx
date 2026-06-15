"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, LoaderCircle, X } from "lucide-react";
import { AuthFlowModal } from "./auth-flow-modal";
import { apiPost } from "@/lib/api-client";

type VerifyEmailResultProps = {
  email: string | null;
  token: string | null;
};

export function VerifyEmailResult({ email, token }: VerifyEmailResultProps) {
  const [status, setStatus] = useState<"checking" | "success" | "error">(
    email && token ? "checking" : "error"
  );
  const [message, setMessage] = useState(
    email && token
      ? "Estamos confirmando sua conta."
      : "Solicite um novo e-mail de verificação para continuar o cadastro."
  );
  useEffect(() => {
    if (!email || !token) {
      return;
    }

    let isCancelled = false;

    async function confirmEmail() {
      try {
        const result = await apiPost<{ message?: string }>("/usuarios/confirmar-email", {
          email,
          token
        });

        if (!isCancelled) {
          setStatus("success");
          setMessage(result?.message ?? "Conta verificada com sucesso.");
        }
      } catch (error) {
        if (!isCancelled) {
          setStatus("error");
          setMessage(
            error instanceof Error && !/fetch|network/i.test(error.message)
              ? error.message
              : "Não foi possível confirmar sua conta agora. Verifique se a API local está em execução e tente novamente."
          );
        }
      }
    }

    confirmEmail();

    return () => {
      isCancelled = true;
    };
  }, [email, token]);

  const Icon = status === "success" ? Check : status === "checking" ? LoaderCircle : X;

  return (
    <section className="reset-password-card reset-password-card-compact" aria-labelledby="verify-title">
      <span
        className={
          status === "success"
            ? "reset-password-icon reset-password-icon-success"
            : status === "error"
              ? "reset-password-icon reset-password-icon-error"
              : "reset-password-icon"
        }
      >
        <Icon aria-hidden="true" className={status === "checking" ? "auth-spin" : undefined} size={24} />
      </span>
      <h1 id="verify-title">
        {status === "success" ? "Conta verificada" : status === "checking" ? "Verificando conta" : "Link inválido"}
      </h1>
      <p>
        {status === "success" && email ? (
          <>
            O e-mail <strong>{email}</strong> foi confirmado. Continue o cadastro para escolher um plano.
          </>
        ) : (
          message
        )}
      </p>

      {status === "success" && email ? (
        <AuthFlowModal
          buttonClassName="reset-password-primary"
          buttonLabel="Continuar cadastro"
          initialEmail={email}
          initialStep="plan"
          triggerIcon="chevron"
        />
      ) : (
        <Link className="reset-password-primary" href="/#inicio">
          Voltar ao site
        </Link>
      )}
    </section>
  );
}
