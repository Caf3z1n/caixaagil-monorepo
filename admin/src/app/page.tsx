"use client";

import type { FormEvent, ReactNode } from "react";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from "lucide-react";

import { ApiError, apiPost } from "@/lib/api-client";
import { getStoredAdminAuthToken, storeAdminSession } from "@/lib/admin-session";

type Administrador = {
  id: number;
  nome: string;
  email: string;
};

type AdminSessionResponse = {
  administrador: Administrador;
  token: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }

  return fallback;
}

function AdminLoginScaffold({ children }: { children: ReactNode }) {
  return (
    <main className="admin-page admin-login-page">
      <section className="admin-login-visual" aria-hidden="true">
        <Image
          alt=""
          fill
          priority
          sizes="(max-width: 840px) 100vw, (max-width: 1280px) 52vw, min(58vw, 139svh)"
          src="/admin-login-illustration.png"
        />
      </section>

      <section className="admin-login-panel">
        <svg className="admin-login-panel-shape" aria-hidden="true" viewBox="0 0 320 1000" preserveAspectRatio="none">
          <path
            className="admin-login-panel-shape-fill"
            d="M250 0 C150 105 156 250 222 352 C282 442 282 558 222 648 C156 750 150 895 250 1000 H320 V0 Z"
          />
          <path
            className="admin-login-panel-shape-line"
            d="M250 0 C150 105 156 250 222 352 C282 442 282 558 222 648 C156 750 150 895 250 1000"
          />
        </svg>
        <div className="admin-login-panel-inner">{children}</div>
      </section>
    </main>
  );
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = getStoredAdminAuthToken();

    if (storedToken) {
      router.replace("/planos");
      return;
    }

    setIsCheckingSession(false);
  }, [router]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email.trim() || !senha.trim() || isLoggingIn) {
      return;
    }

    try {
      setIsLoggingIn(true);
      setFeedback(null);
      const result = await apiPost<AdminSessionResponse>("/admin/sessions", {
        email,
        senha
      });

      storeAdminSession(result.token, result.administrador.email);
      setSenha("");
      router.replace("/planos");
    } catch (error) {
      setFeedback(getErrorMessage(error, "Não foi possível entrar no painel administrativo."));
    } finally {
      setIsLoggingIn(false);
    }
  }

  if (isCheckingSession) {
    return (
      <AdminLoginScaffold>
        <section className="admin-auth-shell admin-loading-shell" aria-live="polite">
          <span className="admin-login-logo">
            <LoaderCircle aria-hidden="true" className="admin-spin" size={24} />
          </span>
          <h1>
            Caixa <span>Ágil</span>
          </h1>
          <p>Validando a sessão administrativa.</p>
        </section>
      </AdminLoginScaffold>
    );
  }

  return (
    <AdminLoginScaffold>
      <section className="admin-auth-shell" aria-labelledby="admin-login-title">
        <div className="admin-login-brand">
          <Image
            alt=""
            aria-hidden="true"
            className="admin-login-logo-image"
            height={118}
            priority
            src="/brand/logo-caixa-agil.png"
            width={118}
          />

          <div className="admin-login-title">
            <h1 id="admin-login-title">
              Caixa <span>Ágil</span>
            </h1>
            <p>Acesse o sistema administrativo</p>
          </div>
        </div>

        {feedback ? (
          <div className="admin-feedback admin-feedback-error" role="alert">
            <AlertTriangle aria-hidden="true" size={17} />
            <span>{feedback}</span>
          </div>
        ) : null}

        <form className="admin-login-form" onSubmit={handleLogin}>
          <label>
            <span>Email</span>
            <span className="admin-input-shell">
              <Mail aria-hidden="true" size={20} />
              <input
                autoComplete="email"
                inputMode="email"
                onChange={event => setEmail(event.currentTarget.value)}
                placeholder="seu@email.com"
                required
                type="email"
                value={email}
              />
            </span>
          </label>

          <label>
            <span>Senha</span>
            <span className="admin-input-shell admin-password-shell">
              <LockKeyhole aria-hidden="true" size={20} />
              <input
                autoComplete="current-password"
                onChange={event => setSenha(event.currentTarget.value)}
                placeholder="Digite sua senha"
                required
                type={showPassword ? "text" : "password"}
                value={senha}
              />
              <button
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                className="admin-password-toggle"
                type="button"
                onClick={() => setShowPassword(current => !current)}
              >
                {showPassword ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
              </button>
            </span>
          </label>

          <button className="admin-primary-button admin-login-submit" disabled={isLoggingIn} type="submit">
            {isLoggingIn ? <LoaderCircle aria-hidden="true" className="admin-spin" size={18} /> : null}
            {isLoggingIn ? "Entrando" : "Entrar"}
          </button>
        </form>
      </section>
    </AdminLoginScaffold>
  );
}
