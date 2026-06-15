"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, LoaderCircle, X } from "lucide-react";

import { apiPost } from "@/lib/api-client";
import { PLATFORM_ACCOUNT_EMAIL_STORAGE_KEY } from "@/lib/platform-session";

type ConfirmEmailChangeResultProps = {
  email: string | null;
  token: string | null;
};

export function ConfirmEmailChangeResult({ email, token }: ConfirmEmailChangeResultProps) {
  const [status, setStatus] = useState<"checking" | "success" | "error">(
    email && token ? "checking" : "error"
  );
  const [message, setMessage] = useState(
    email && token
      ? "Estamos confirmando o novo e-mail."
      : "O link de troca de e-mail está incompleto."
  );

  useEffect(() => {
    if (!email || !token) {
      return;
    }

    let cancelled = false;

    async function confirmEmailChange() {
      try {
        const result = await apiPost<{ email?: string; message?: string }>("/conta/confirmar-email", {
          email,
          token
        });

        if (cancelled) {
          return;
        }

        if (result.email) {
          window.localStorage.setItem(PLATFORM_ACCOUNT_EMAIL_STORAGE_KEY, result.email);
        }

        setStatus("success");
        setMessage(result.message || "E-mail atualizado com sucesso.");
      } catch (error) {
        if (cancelled) {
          return;
        }

        setStatus("error");
        setMessage(
          error instanceof Error && !/fetch|network/i.test(error.message)
            ? error.message
            : "Não foi possível confirmar o e-mail agora."
        );
      }
    }

    void confirmEmailChange();

    return () => {
      cancelled = true;
    };
  }, [email, token]);

  const Icon = status === "success" ? Check : status === "checking" ? LoaderCircle : X;

  return (
    <section className="reset-password-card reset-password-card-compact" aria-labelledby="email-change-title">
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
      <h1 id="email-change-title">
        {status === "success" ? "E-mail confirmado" : status === "checking" ? "Confirmando e-mail" : "Link inválido"}
      </h1>
      <p>
        {status === "success" && email ? (
          <>
            O e-mail <strong>{email}</strong> agora está vinculado à conta.
          </>
        ) : (
          message
        )}
      </p>

      <Link className="reset-password-primary" href={status === "success" ? "/conta" : "/#inicio"}>
        {status === "success" ? "Abrir minha conta" : "Voltar ao site"}
      </Link>
    </section>
  );
}
