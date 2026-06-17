# Worker fiscal Unimake

## Origem da migração

O projeto antigo em `C:\Pedro\Programacao\caixa-agil-monorepo\caixa-agil` centralizava a emissão fiscal no Electron:

- `electron/services/fiscal-service.ts` orquestrava venda, configuração fiscal, série, número, XML, status e tentativas.
- `electron/services/nfce-payload-builder.ts` montava o XML de NF-e/NFC-e no Node.
- `electron/services/uninfe-service.ts` enviava XML para as pastas da UniNFe, aguardava retorno, consultava protocolo, cancelava, inutilizava e chamava o executável de DANFE.
- `electron/db/schema.ts` tinha `empresa_fiscal_local`, `documentos_fiscais` e `documentos_fiscais_tentativas`.
- A impressão antiga partia do XML autorizado/processado, não de print de tela.

O ponto que muda nesta base é o runtime fiscal: sai a dependência de UniNFe/UniDANFE instalados manualmente e entra um worker .NET embutido no PDV, com `Unimake.DFe` e `Unimake.Unidanfe.NET6`.

## Arquitetura escolhida

O PDV chama o worker por processo filho com JSON em `stdin/stdout`.

Motivos:

- combina com o Electron atual, que já é local e simples;
- evita abrir porta HTTP local;
- permite empacotar o worker como `exe` self-contained;
- mantém a UI isolada da biblioteca fiscal;
- deixa logs e documentos persistidos mesmo quando o retorno visual falha.

Fluxo:

```text
PDV Electron
  -> pdv/electron/fiscal-worker-service.cjs
  -> CaixaAgil.FiscalWorker.exe
  -> Unimake.DFe / Unimake.Unidanfe.NET6
  -> XML autorizado / DANFE / impressora Windows
```

## Comandos suportados no protocolo

O worker já aceita:

- `validar-configuracao`
- `listar-impressoras-disponiveis`
- `diagnosticar-impressora`
- `consultar-status-sefaz`
- `emitir-nfce`
- `emitir-nfe`
- `consultar-protocolo`
- `cancelar`
- `inutilizar`
- `imprimir-danfe`
- `reimprimir-danfe`
- `gerar-pdf-danfe`

Nesta etapa, a validação de configuração, certificado A1/PFX, diretórios e impressoras já é executável. As chamadas fiscais reais de autorização, cancelamento, inutilização e DANFE estão preparadas como pontos de integração explícitos para ligar aos tipos finais da Unimake com dados homologados.

## Configuração

A API guarda dados fiscais de negócio em `configuracoes.fiscal`, atualizados por:

```http
PUT /configuracoes/fiscal
```

No painel web, a tela `meu-sistema/configuracoes -> Cadastro fiscal` cadastra emitente, ambiente, UF, certificado A1, senha, CSC, série, próxima numeração e impressão. A resposta da API nunca devolve senha do certificado nem chave CSC em texto puro; esses campos ficam mascarados por flags como `senha_configurada` e `csc_token_configurado`.

No banco central, a senha do PFX e o CSC são gravados criptografados com `FISCAL_CONFIG_SECRET` quando definido, ou com o segredo JWT como fallback de desenvolvimento. Em produção, configure `FISCAL_CONFIG_SECRET` com um valor estável e privado antes de salvar credenciais fiscais reais.

O PDV guarda dados locais no SQLite do desktop:

- configuração fiscal local por escopo em `pdv_metadata`;
- rastreabilidade em `fiscal_documents`;
- logs técnicos em `%APPDATA%\Caixa Ágil PDV\fiscal\logs`.

Campos esperados pelo worker:

```json
{
  "ambiente": "homologacao",
  "uf": "SP",
  "modeloPrioritario": "65",
  "emitente": {
    "cnpjCpf": "00000000000000",
    "razaoSocial": "EMPRESA LTDA",
    "inscricaoEstadual": "000000000000",
    "crt": "1"
  },
  "certificado": {
    "pfxPath": "C:\\caminho\\certificado.pfx",
    "pfxPassword": "senha-local"
  },
  "nfce": {
    "serie": 1,
    "ultimoNumero": 0,
    "cscId": "000001",
    "cscToken": "token-csc"
  },
  "impressao": {
    "useDefaultPrinter": true,
    "printerName": "POS-80C",
    "bobinaMm": 80
  }
}
```

Para emissão local no PDV, o worker ainda espera um `pfxPath` acessível no Windows. A sincronização final entre o certificado privado salvo no backend e o arquivo local consumido pelo worker deve baixar/armazenar esse certificado em área privada do desktop e pode evoluir para DPAPI/keytar no Electron.

## Build e empacotamento

Compilar o worker:

```powershell
npm --prefix pdv run build:fiscal-worker
```

Publicar self-contained para Windows:

```powershell
npm --prefix pdv run publish:fiscal-worker
```

O script publica em:

```text
pdv/electron/resources/fiscal-worker/win-x64
```

Na aplicação empacotada, inclua esse diretório como recurso do Electron. Em desenvolvimento, o serviço também consegue executar via `dotnet run --project`.

## Testes operacionais

Listar impressoras:

```powershell
$payload = @{ command = "listar-impressoras-disponiveis"; config = @{}; payload = @{} } | ConvertTo-Json -Depth 8
$payload | dotnet run --project pdv\fiscal-worker\CaixaAgil.FiscalWorker\CaixaAgil.FiscalWorker.csproj --no-launch-profile --
```

Validar configuração:

```powershell
$payload = @{
  command = "validar-configuracao"
  config = @{
    ambiente = "homologacao"
    uf = "SP"
    emitente = @{ cnpjCpf = "00000000000000"; razaoSocial = "EMPRESA LTDA"; inscricaoEstadual = "000000000000"; crt = "1" }
    certificado = @{ pfxPath = "C:\certificado\homologacao.pfx"; pfxPassword = "senha" }
    nfce = @{ serie = 1; ultimoNumero = 0; cscId = "000001"; cscToken = "token" }
    impressao = @{ useDefaultPrinter = $true; bobinaMm = 80 }
  }
  payload = @{}
} | ConvertTo-Json -Depth 8
$payload | dotnet run --project pdv\fiscal-worker\CaixaAgil.FiscalWorker\CaixaAgil.FiscalWorker.csproj --no-launch-profile --
```

## Pendências reais

- Mapear payload de venda do PDV para os tipos NFe/NFCe da `Unimake.DFe`.
- Assinar e transmitir em homologação com certificado A1 válido, CSC, UF e dados reais do emitente.
- Conectar consulta de status, protocolo, cancelamento e inutilização aos serviços Unimake.
- Conectar impressão e PDF aos objetos finais da `Unimake.Unidanfe.NET6` e validar licença/configuração do cliente.
- Conectar o certificado privado do backend ao arquivo local usado pelo worker no desktop.
- Implementar armazenamento seguro complementar no desktop com DPAPI/keytar quando a senha precisar existir localmente.
- Criar tela operacional equivalente no PDV, se a configuração fiscal também precisar ser feita fora do painel web.
