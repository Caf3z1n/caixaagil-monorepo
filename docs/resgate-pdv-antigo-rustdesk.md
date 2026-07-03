# Resgate do PDV antigo via RustDesk

Este fluxo e para recuperar dados que ficaram apenas no computador do caixa antigo do Caixa Agil.

## 1. Coletar no PC antigo

1. Conecte no PC antigo pelo RustDesk.
2. Feche o Caixa Agil antigo se ele estiver aberto.
3. Envie o arquivo `scripts/collect-caixaagil-old-pc-data.ps1` para a area de trabalho do PC antigo.
4. Abra o PowerShell como administrador no PC antigo e rode:

```powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\Desktop\collect-caixaagil-old-pc-data.ps1"
```

O script gera uma pasta e um ZIP em `Desktop\caixaagil-resgate`. Esse pacote contem banco SQLite, arquivos WAL/SHM, fotos de produtos, storage local e logs encontrados. Ele e sensivel e deve ser transferido somente por canal confiavel.

## 2. Analisar e gerar export local

Copie o ZIP para este computador e extraia. Depois rode:

```powershell
node scripts/analyze-caixaagil-old-pdv-export.mjs --package-dir "C:\caminho\para\caixaagil-old-pdv-NOME-YYYYMMDD-HHMMSS" --output "C:\Pedro\Programacao\caixaagil-legacy-exports\legacy-caixa-agil-local-YYYYMMDD-HHMMSS"
```

O resultado e um export JSON no mesmo formato dos scripts de migracao existentes. Se fotos forem encontradas, o comando mostrara o caminho para usar com `--legacy-media-dir`.

## Diagnostico de PDVs novos

O mesmo coletor tambem serve para suporte em PDVs novos. Depois de copiar o pacote para esta maquina, rode:

```powershell
node scripts/analyze-caixaagil-pdv-diagnostics.mjs --package-dir "C:\caminho\para\caixaagil-old-pdv-NOME-YYYYMMDD-HHMMSS"
```

Esse comando resume a fila local `sync_outbox`, documentos fiscais pendentes/falhos, metadados do PDV, status RustDesk sem expor senha e arquivos de log encontrados.

## 3. Importar no sistema novo

Primeiro rode dry-run:

```powershell
node api\scripts\migration\import-legacy-caixa-agil.js --dry-run --export-dir "C:\Pedro\Programacao\caixaagil-legacy-exports\legacy-caixa-agil-local-YYYYMMDD-HHMMSS" --target-user-email phservice@eticasistemas.com.br
```

Depois rode grupos fiscais e imagens em dry-run:

```powershell
node api\scripts\migration\import-legacy-fiscal-and-images.js --dry-run --export-dir "C:\Pedro\Programacao\caixaagil-legacy-exports\legacy-caixa-agil-local-YYYYMMDD-HHMMSS" --target-user-email phservice@eticasistemas.com.br --legacy-media-dir "C:\Pedro\Programacao\caixaagil-legacy-exports\legacy-caixa-agil-local-YYYYMMDD-HHMMSS\legacy-media\product-images"
```

O `apply` so deve ser feito depois de backup do banco novo e comparacao das contagens contra o pacote local.
