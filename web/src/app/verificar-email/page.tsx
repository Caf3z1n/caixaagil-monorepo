import type { Metadata } from "next";
import { VerifyEmailResult } from "@/components/verify-email-result";

export const metadata: Metadata = {
  title: "Verificar conta"
};

type VerifyEmailPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const query = await searchParams;
  const email = typeof query.email === "string" ? query.email : null;
  const token = typeof query.token === "string" ? query.token : null;

  return (
    <main className="reset-password-page">
      <VerifyEmailResult email={email} token={token} />
    </main>
  );
}
