"use client";

import { AuthFlowModal } from "./auth-flow-modal";

type PaymentLoginActionProps = {
  email: string | null;
};

export function PaymentLoginAction({ email }: PaymentLoginActionProps) {
  return (
    <AuthFlowModal
      buttonVariant="primary"
      buttonLabel="Entrar no sistema"
      initialEmail={email ?? undefined}
      initialStep={email ? "password" : "email"}
    />
  );
}
