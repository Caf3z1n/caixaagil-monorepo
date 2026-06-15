import type { Metadata } from "next";

import { OnboardingFlow } from "@/components/onboarding-flow";

export const metadata: Metadata = {
  title: "Configuração inicial | Caixa Ágil",
  description: "Configure o primeiro PDV da conta Caixa Ágil."
};

export default function OnboardingPage() {
  return <OnboardingFlow />;
}
