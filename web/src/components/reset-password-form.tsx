"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Eye, EyeOff, LoaderCircle, LockKeyhole, X } from "lucide-react";
import { apiPost } from "@/lib/api-client";
import { AuthFeedback } from "./auth-feedback";

type ResetPasswordFormProps = {
  email: string | null;
  token: string | null;
};

function getPasswordRequirements(password: string) {
  return [
    { label: "8 caracteres", passed: password.trim().length >= 8 },
    { label: "Maiúscula", passed: /[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ]/.test(password) },
    { label: "Minúscula", passed: /[a-záàâãéèêíïóôõöúçñ]/.test(password) },
    { label: "Número", passed: /\d/.test(password) }
  ];
}

export function ResetPasswordForm({ email, token }: ResetPasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");
  const hasLinkParams = Boolean(token && email);
  const [linkStatus, setLinkStatus] = useState<"checking" | "valid" | "invalid">(
    hasLinkParams ? "checking" : "invalid"
  );
  const [linkMessage, setLinkMessage] = useState("Solicite um novo e-mail de redefinição para criar outra senha de acesso.");
  const hasValidLink = hasLinkParams && linkStatus === "valid";

  const passwordRequirements = useMemo(() => getPasswordRequirements(password), [password]);
  const isPasswordSecure = passwordRequirements.every((requirement) => requirement.passed);
  const doPasswordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const passwordError = submitted && !isPasswordSecure;
  const confirmPasswordError = submitted && !doPasswordsMatch;

  useEffect(() => {
    if (!hasLinkParams) {
      setLinkStatus("invalid");
      setLinkMessage("Solicite um novo e-mail de redefinição para criar outra senha de acesso.");
      return;
    }

    let cancelled = false;
    setLinkStatus("checking");
    setLinkMessage("");

    apiPost<{ message?: string }>("/usuarios/validar-redefinicao-senha", {
      email,
      token
    })
      .then(() => {
        if (!cancelled) {
          setLinkStatus("valid");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLinkStatus("invalid");
          setLinkMessage(error instanceof Error ? error.message : "Link de redefinição inválido ou expirado.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [email, hasLinkParams, token]);

  async function savePassword() {
    setSubmitted(true);
    setMessage("");

    if (!hasValidLink || !isPasswordSecure || !doPasswordsMatch || status === "saving") {
      return;
    }

    setStatus("saving");

    try {
      await apiPost<{ message?: string }>("/usuarios/redefinir-senha", {
        email,
        token,
        senha: password
      });
      setCompleted(true);
    } catch (error) {
      setStatus("error");
      const nextMessage = error instanceof Error ? error.message : "Não foi possível redefinir sua senha.";
      setMessage(nextMessage);

      if (nextMessage.toLowerCase().includes("expirado")) {
        setLinkStatus("invalid");
        setLinkMessage(nextMessage);
      }
    }
  }

  if (hasLinkParams && linkStatus === "checking") {
    return (
      <section className="reset-password-card reset-password-card-compact" aria-labelledby="reset-title" aria-live="polite">
        <span className="reset-password-icon">
          <LoaderCircle aria-hidden="true" className="auth-spin" size={24} />
        </span>
        <h1 id="reset-title">Verificando link</h1>
        <p>Estamos conferindo se este link de redefinição ainda está válido.</p>
      </section>
    );
  }

  if (!hasValidLink) {
    return (
      <section className="reset-password-card reset-password-card-compact" aria-labelledby="reset-title">
        <span className="reset-password-icon reset-password-icon-error">
          <X aria-hidden="true" size={24} />
        </span>
        <h1 id="reset-title">Link inválido</h1>
        <p>{linkMessage}</p>
        <Link className="reset-password-primary" href="/#inicio">
          Voltar ao site
          <ArrowRight aria-hidden="true" size={18} />
        </Link>
      </section>
    );
  }

  if (completed) {
    return (
      <section className="reset-password-card reset-password-card-compact" aria-labelledby="reset-title">
        <span className="reset-password-icon reset-password-icon-success">
          <Check aria-hidden="true" size={24} />
        </span>
        <h1 id="reset-title">Senha redefinida</h1>
        <p>
          Sua nova senha foi salva com sucesso. Você já pode acessar sua conta com a nova senha.
        </p>
        <Link className="reset-password-primary" href="/#inicio">
          Voltar ao site
          <ArrowRight aria-hidden="true" size={18} />
        </Link>
      </section>
    );
  }

  return (
    <section className="reset-password-card" aria-labelledby="reset-title">
      <span className="reset-password-icon">
        <LockKeyhole aria-hidden="true" size={24} />
      </span>
      <h1 id="reset-title">Crie uma nova senha</h1>
      <p>
        Defina a senha de acesso para <strong>{email}</strong>.
      </p>

      <label className="reset-password-field">
        <span>Nova senha</span>
        <div className="reset-password-input">
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={passwordError}
            placeholder="Crie uma senha segura"
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            onClick={() => setShowPassword((current) => !current)}
          >
            {showPassword ? <EyeOff aria-hidden="true" size={17} /> : <Eye aria-hidden="true" size={17} />}
          </button>
        </div>
        {passwordError ? <small>A senha ainda não atende aos requisitos mínimos.</small> : null}
      </label>

      <div className="reset-password-rules" aria-label="Requisitos da senha">
        {passwordRequirements.map((requirement) => (
          <span
            className={requirement.passed ? "reset-password-rule reset-password-rule-ok" : "reset-password-rule"}
            key={requirement.label}
          >
            <i aria-hidden="true">
              {requirement.passed ? <Check size={11} /> : <X size={11} />}
            </i>
            {requirement.label}
          </span>
        ))}
      </div>

      <label className="reset-password-field">
        <span>Confirmar senha</span>
        <div className="reset-password-input">
          <input
            type={showConfirmPassword ? "text" : "password"}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                savePassword();
              }
            }}
            aria-invalid={confirmPasswordError}
            placeholder="Repita a senha"
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label={showConfirmPassword ? "Ocultar senha" : "Mostrar senha"}
            onClick={() => setShowConfirmPassword((current) => !current)}
          >
            {showConfirmPassword ? <EyeOff aria-hidden="true" size={17} /> : <Eye aria-hidden="true" size={17} />}
          </button>
        </div>
        {confirmPasswordError ? <small>As senhas precisam ser iguais.</small> : null}
      </label>

      <div className="reset-password-rules reset-password-confirm-rule" aria-label="Confirmação da senha">
        <span className={doPasswordsMatch ? "reset-password-rule reset-password-rule-ok" : "reset-password-rule"}>
          <i aria-hidden="true">
            {doPasswordsMatch ? <Check size={11} /> : <X size={11} />}
          </i>
          Senhas iguais
        </span>
      </div>

      {message ? (
        <AuthFeedback tone="error">
          {message}
        </AuthFeedback>
      ) : null}

      <button
        className="reset-password-primary"
        type="button"
        onClick={savePassword}
        disabled={!isPasswordSecure || !doPasswordsMatch || status === "saving"}
      >
        {status === "saving" ? "Salvando..." : "Salvar senha"}
        <ArrowRight aria-hidden="true" size={18} />
      </button>
    </section>
  );
}
