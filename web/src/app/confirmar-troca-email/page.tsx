import type { Metadata } from "next";

import { ConfirmEmailChangeResult } from "@/components/confirm-email-change-result";

export const metadata: Metadata = {
  title: "Confirmar e-mail"
};

type ConfirmEmailChangePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ConfirmEmailChangePage({ searchParams }: ConfirmEmailChangePageProps) {
  const query = await searchParams;
  const email = typeof query.email === "string" ? query.email : null;
  const token = typeof query.token === "string" ? query.token : null;

  return (
    <main className="reset-password-page">
      <ConfirmEmailChangeResult email={email} token={token} />
    </main>
  );
}
