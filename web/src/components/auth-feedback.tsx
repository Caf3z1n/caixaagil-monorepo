import type { ReactNode } from "react";

type AuthFeedbackTone = "neutral" | "success" | "error" | "warning";

type AuthFeedbackProps = {
  tone?: AuthFeedbackTone;
  children: ReactNode;
};

export function AuthFeedback({ tone = "neutral", children }: AuthFeedbackProps) {
  return (
    <div className={`auth-feedback auth-feedback-${tone}`} aria-live="polite" role={tone === "error" ? "alert" : "status"}>
      <span className="auth-feedback-marker" aria-hidden="true" />
      <span className="auth-feedback-copy">
        <small>{children}</small>
      </span>
    </div>
  );
}
