import type { Metadata } from "next";

import { ResetPasswordForm } from "@/components/reset-password-form";

export const metadata: Metadata = {
  title: "Redefinir senha"
};

type ResetPasswordPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const query = await searchParams;
  const email = typeof query.email === "string" ? query.email : null;
  const token = typeof query.token === "string" ? query.token : null;

  return (
    <main className="reset-password-page">
      <ResetPasswordForm email={email} token={token} />
    </main>
  );
}
