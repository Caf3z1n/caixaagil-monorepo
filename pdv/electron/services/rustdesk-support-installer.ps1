param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerUrl,

  [Parameter(Mandatory = $true)]
  [string]$InstallerSha256,

  [Parameter(Mandatory = $true)]
  [string]$ConfigString,

  [Parameter(Mandatory = $true)]
  [string]$StatusPath
)

$ErrorActionPreference = "Stop"

function Write-SupportStatus {
  param([hashtable]$Status)

  $directory = Split-Path -Parent $StatusPath
  if (!(Test-Path $directory)) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
  }

  $Status.atualizado_em = (Get-Date).ToUniversalTime().ToString("o")
  $Status | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $StatusPath -Encoding UTF8
}

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Quote-Argument {
  param([string]$Value)
  return '"' + ($Value -replace '"', '\"') + '"'
}

if (!(Test-IsAdministrator)) {
  Write-SupportStatus @{
    status = "configurando"
    etapa = "aguardando_uac"
  }

  $arguments = @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    (Quote-Argument $PSCommandPath),
    "-InstallerUrl",
    (Quote-Argument $InstallerUrl),
    "-InstallerSha256",
    (Quote-Argument $InstallerSha256),
    "-ConfigString",
    (Quote-Argument $ConfigString),
    "-StatusPath",
    (Quote-Argument $StatusPath)
  ) -join " "

  $process = Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $arguments -Wait -PassThru
  exit $process.ExitCode
}

function New-RustDeskPassword {
  $chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_"
  $bytes = New-Object byte[] 24
  [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $password = -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
  return $password
}

function Get-RustDeskExe {
  $candidates = @(
    "$env:ProgramFiles\RustDesk\rustdesk.exe",
    "${env:ProgramFiles(x86)}\RustDesk\rustdesk.exe"
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return $candidate
    }
  }

  return $null
}

function Get-RustDeskService {
  return Get-Service | Where-Object { $_.Name -ieq "Rustdesk" -or $_.DisplayName -like "RustDesk*" } | Select-Object -First 1
}

try {
  Write-SupportStatus @{
    status = "configurando"
    etapa = "preparando"
  }

  $downloadDir = Join-Path $env:ProgramData "CaixaAgil\support\downloads"
  if (!(Test-Path $downloadDir)) {
    New-Item -ItemType Directory -Force -Path $downloadDir | Out-Null
  }

  $installerPath = Join-Path $downloadDir "rustdesk-installer.exe"
  $rustdeskExe = Get-RustDeskExe

  if (!$rustdeskExe) {
    $needsDownload = $true
    if (Test-Path -LiteralPath $installerPath) {
      $currentHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $installerPath).Hash.ToLowerInvariant()
      $needsDownload = $currentHash -ne $InstallerSha256.ToLowerInvariant()
      if ($needsDownload) {
        Remove-Item -LiteralPath $installerPath -Force
      }
    }

    if ($needsDownload) {
      Write-SupportStatus @{
        status = "configurando"
        etapa = "baixando_instalador"
      }
      Invoke-WebRequest -Uri $InstallerUrl -OutFile $installerPath -UseBasicParsing
    }

    $downloadedHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $installerPath).Hash.ToLowerInvariant()
    if ($downloadedHash -ne $InstallerSha256.ToLowerInvariant()) {
      throw "Hash do instalador RustDesk invalido."
    }

    Write-SupportStatus @{
      status = "configurando"
      etapa = "instalando"
    }
    $installer = Start-Process -FilePath $installerPath -ArgumentList "--silent-install" -Wait -PassThru
    if ($installer.ExitCode -ne 0) {
      throw "Instalador RustDesk retornou codigo $($installer.ExitCode)."
    }

    Start-Sleep -Seconds 8
    $rustdeskExe = Get-RustDeskExe
  }

  if (!$rustdeskExe) {
    throw "rustdesk.exe nao encontrado apos instalacao."
  }

  $service = Get-RustDeskService
  if (!$service) {
    Write-SupportStatus @{
      status = "configurando"
      etapa = "instalando_servico"
    }
    Start-Process -FilePath $rustdeskExe -ArgumentList "--install-service" -Wait | Out-Null
    Start-Sleep -Seconds 5
    $service = Get-RustDeskService
  }

  if ($service -and $service.Status -ne "Running") {
    Start-Service -Name $service.Name
    Start-Sleep -Seconds 3
  }

  Write-SupportStatus @{
    status = "configurando"
    etapa = "aplicando_configuracao"
  }
  & $rustdeskExe --config $ConfigString | Out-Null

  $password = New-RustDeskPassword
  & $rustdeskExe --password $password | Out-Null

  Start-Sleep -Seconds 2
  $rustdeskId = (& $rustdeskExe --get-id | Select-Object -First 1).Trim()
  if (!$rustdeskId) {
    throw "Nao foi possivel obter o ID do RustDesk."
  }

  $versionInfo = (Get-Item -LiteralPath $rustdeskExe).VersionInfo
  $version = $versionInfo.ProductVersion
  if (!$version) {
    $version = $versionInfo.FileVersion
  }

  Write-SupportStatus @{
    status = "configurado"
    rustdesk_id = $rustdeskId
    senha = $password
    versao = $version
  }

  exit 0
} catch {
  Write-SupportStatus @{
    status = "erro"
    erro = $_.Exception.Message
  }
  exit 1
}
