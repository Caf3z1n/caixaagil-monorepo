import { FuncionarioManager } from "@/components/funcionario-manager";
import { PlatformFrame } from "@/components/platform-frame";

export default function MeuSistemaFuncionariosPage() {
  return (
    <PlatformFrame>
      <FuncionarioManager />
    </PlatformFrame>
  );
}
