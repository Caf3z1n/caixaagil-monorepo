param(
  [string]$OutputRoot = "",
  [switch]$SkipArchive,
  [switch]$IncludeCaches,
  [switch]$DeepSearch
)

$ErrorActionPreference = "Stop"

function Get-SafeSegment {
  param([string]$Value)

  $segment = ($Value -replace "[^a-zA-Z0-9._-]", "-").Trim("-")
  if (!$segment) {
    return "unknown"
  }

  return $segment
}

function Get-NowIso {
  return (Get-Date).ToUniversalTime().ToString("o")
}

function Get-RelativePath {
  param(
    [string]$Root,
    [string]$Path
  )

  $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd("\", "/")
  $pathFull = [System.IO.Path]::GetFullPath($Path)

  if ($pathFull.Length -le $rootFull.Length) {
    return ""
  }

  return $pathFull.Substring($rootFull.Length).TrimStart("\", "/")
}

function Test-PathInside {
  param(
    [string]$Root,
    [string]$Path
  )

  $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd("\", "/")
  $pathFull = [System.IO.Path]::GetFullPath($Path)
  return $pathFull -eq $rootFull -or $pathFull.StartsWith($rootFull + [System.IO.Path]::DirectorySeparatorChar)
}

function Add-UniquePath {
  param(
    [System.Collections.ArrayList]$List,
    [string]$Path
  )

  if (!$Path) {
    return
  }

  try {
    if (!(Test-Path -LiteralPath $Path -ErrorAction Stop)) {
      return
    }

    $resolved = (Resolve-Path -LiteralPath $Path -ErrorAction Stop).Path
    if (!$List.Contains($resolved)) {
      [void]$List.Add($resolved)
    }
  } catch {
    return
  }
}

function Get-UserProfileDataRoots {
  $roots = New-Object System.Collections.ArrayList

  Add-UniquePath $roots $env:APPDATA
  Add-UniquePath $roots $env:LOCALAPPDATA
  Add-UniquePath $roots $env:ProgramData

  $usersRoot = Join-Path $env:SystemDrive "Users"
  if (Test-Path -LiteralPath $usersRoot) {
    Get-ChildItem -LiteralPath $usersRoot -Directory -Force -ErrorAction SilentlyContinue | ForEach-Object {
      if ($_.Name -in @("Default", "Default User", "All Users", "Public")) {
        return
      }

      Add-UniquePath $roots (Join-Path $_.FullName "AppData\Roaming")
      Add-UniquePath $roots (Join-Path $_.FullName "AppData\Local")
    }
  }

  return @($roots)
}

function Test-CaixaAgilName {
  param([string]$Name)

  $normalized = ($Name.ToLowerInvariant() -replace "[\s._-]", "")
  return $normalized -like "*caixa*gil*"
}

function Find-CaixaAgilUserDataDirs {
  param([string[]]$Roots)

  $directories = New-Object System.Collections.ArrayList
  $exactNames = @(
    "Caixa Agil",
    "CaixaAgil",
    "caixa-agil",
    "caixaagil",
    "br.com.caixaagil.desktop"
  )

  foreach ($root in $Roots) {
    foreach ($name in $exactNames) {
      Add-UniquePath $directories (Join-Path $root $name)
    }

    Get-ChildItem -LiteralPath $root -Directory -Force -ErrorAction SilentlyContinue | Where-Object {
      Test-CaixaAgilName $_.Name
    } | ForEach-Object {
      Add-UniquePath $directories $_.FullName
    }
  }

  return @($directories)
}

function Test-ExcludedRelativePath {
  param([string]$RelativePath)

  if ($IncludeCaches) {
    return $false
  }

  $excludedNames = @(
    "Cache",
    "Code Cache",
    "GPUCache",
    "DawnCache",
    "ShaderCache",
    "GrShaderCache",
    "Crashpad",
    "CrashpadMetrics-active.pma",
    "blob_storage",
    "CacheStorage"
  )

  $parts = $RelativePath -split "[\\/]"
  foreach ($part in $parts) {
    if ($excludedNames -contains $part) {
      return $true
    }
  }

  return $false
}

function Copy-FileSafe {
  param(
    [string]$Source,
    [string]$Destination,
    [System.Collections.ArrayList]$CopiedFiles,
    [System.Collections.ArrayList]$Warnings
  )

  try {
    $destinationDirectory = Split-Path -Parent $Destination
    if (!(Test-Path -LiteralPath $destinationDirectory)) {
      New-Item -ItemType Directory -Force -Path $destinationDirectory | Out-Null
    }

    Copy-Item -LiteralPath $Source -Destination $Destination -Force

    $item = Get-Item -LiteralPath $Destination -Force
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $Destination).Hash.ToLowerInvariant()
    [void]$CopiedFiles.Add([ordered]@{
      source = $Source
      relative_path = $Destination
      bytes = [int64]$item.Length
      sha256 = $hash
    })
  } catch {
    [void]$Warnings.Add("Falha ao copiar arquivo '$Source': $($_.Exception.Message)")
  }
}

function Copy-DirectoryFiltered {
  param(
    [string]$Source,
    [string]$Destination,
    [System.Collections.ArrayList]$CopiedFiles,
    [System.Collections.ArrayList]$Warnings
  )

  if (!(Test-Path -LiteralPath $Source)) {
    return
  }

  $sourceRoot = (Resolve-Path -LiteralPath $Source).Path
  Get-ChildItem -LiteralPath $sourceRoot -Force -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
    $relative = Get-RelativePath $sourceRoot $_.FullName
    if (!$relative -or (Test-ExcludedRelativePath $relative)) {
      return
    }

    $destinationPath = Join-Path $Destination $relative
    if ($_.PSIsContainer) {
      if (!(Test-Path -LiteralPath $destinationPath)) {
        New-Item -ItemType Directory -Force -Path $destinationPath | Out-Null
      }
      return
    }

    Copy-FileSafe -Source $_.FullName -Destination $destinationPath -CopiedFiles $CopiedFiles -Warnings $Warnings
  }
}

function Find-DatabaseFiles {
  param([string[]]$Roots)

  $files = New-Object System.Collections.ArrayList
  $targetNames = @("caixa-agil.sqlite", "caixa-agil-dev.db")

  foreach ($root in $Roots) {
    Get-ChildItem -LiteralPath $root -Recurse -File -Force -ErrorAction SilentlyContinue | Where-Object {
      $name = $_.Name.ToLowerInvariant()
      $path = $_.FullName.ToLowerInvariant()
      $extension = $_.Extension.ToLowerInvariant()

      return ($targetNames -contains $name) -or (
        ($extension -in @(".sqlite", ".db")) -and
        ($path -like "*caixa*") -and
        ($path -like "*gil*")
      )
    } | ForEach-Object {
      Add-UniquePath $files $_.FullName
      foreach ($suffix in @("-wal", "-shm")) {
        Add-UniquePath $files ($_.FullName + $suffix)
      }
    }
  }

  return @($files)
}

function Get-CaixaAgilProcesses {
  $items = @()

  Get-Process -ErrorAction SilentlyContinue | ForEach-Object {
    $path = $null
    try {
      $path = $_.Path
    } catch {
      $path = $null
    }

    if ((Test-CaixaAgilName $_.ProcessName) -or ($path -and (Test-CaixaAgilName $path))) {
      $items += [ordered]@{
        name = $_.ProcessName
        id = $_.Id
        path = $path
      }
    }
  }

  return $items
}

if (!$OutputRoot) {
  $desktop = [Environment]::GetFolderPath("Desktop")
  if (!$desktop) {
    $desktop = $env:TEMP
  }
  $OutputRoot = Join-Path $desktop "caixaagil-resgate"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$machine = Get-SafeSegment $env:COMPUTERNAME
$exportName = "caixaagil-old-pdv-$machine-$timestamp"
$exportDir = Join-Path $OutputRoot $exportName
$filesDir = Join-Path $exportDir "files"
$manifestPath = Join-Path $exportDir "manifest.json"
$logPath = Join-Path $exportDir "collector.log"

New-Item -ItemType Directory -Force -Path $filesDir | Out-Null

$warnings = New-Object System.Collections.ArrayList
$copiedFiles = New-Object System.Collections.ArrayList
$sources = New-Object System.Collections.ArrayList

Start-Transcript -Path $logPath -Force | Out-Null

try {
  Write-Host "Coletando dados locais do Caixa Agil antigo..."
  Write-Host "Saida: $exportDir"

  $dataRoots = Get-UserProfileDataRoots
  $userDataDirs = Find-CaixaAgilUserDataDirs -Roots $dataRoots
  $dbSearchRoots = @($userDataDirs)
  if ($DeepSearch) {
    $dbSearchRoots = $dataRoots
  }
  $dbFiles = Find-DatabaseFiles -Roots $dbSearchRoots
  $processes = Get-CaixaAgilProcesses

  if ($processes.Count -gt 0) {
    [void]$warnings.Add("O Caixa Agil parece estar aberto. Para uma copia mais consistente, feche o app antigo e rode novamente se possivel.")
  }

  if ($userDataDirs.Count -eq 0 -and $dbFiles.Count -eq 0) {
    [void]$warnings.Add("Nenhum diretorio ou banco do Caixa Agil antigo foi encontrado automaticamente.")
    if (!$DeepSearch) {
      [void]$warnings.Add("Se o app antigo usava outro usuario do Windows, rode novamente como administrador com -DeepSearch.")
    }
  }

  foreach ($dir in $userDataDirs) {
    $sourceKey = Get-SafeSegment ((Get-RelativePath (Split-Path -Parent $dir) $dir) -replace "\\", "-")
    $destination = Join-Path $filesDir "userdata-$sourceKey"
    [void]$sources.Add([ordered]@{
      type = "userdata"
      path = $dir
      copied_to = $destination
    })
    Copy-DirectoryFiltered -Source $dir -Destination $destination -CopiedFiles $copiedFiles -Warnings $warnings
  }

  foreach ($dbFile in $dbFiles) {
    $parent = Split-Path -Parent $dbFile
    $parentKey = Get-SafeSegment (($parent -replace ":", "") -replace "\\", "-")
    $destination = Join-Path $filesDir (Join-Path "loose-databases" (Join-Path $parentKey (Split-Path -Leaf $dbFile)))
    [void]$sources.Add([ordered]@{
      type = "database"
      path = $dbFile
      copied_to = $destination
    })
    Copy-FileSafe -Source $dbFile -Destination $destination -CopiedFiles $copiedFiles -Warnings $warnings
  }

  $manifest = [ordered]@{
    schema = "caixaagil-old-pdv-rescue.v1"
    generated_at = Get-NowIso
    export_name = $exportName
    export_dir = $exportDir
    computer = [ordered]@{
      name = $env:COMPUTERNAME
      user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
      os = (Get-CimInstance Win32_OperatingSystem | Select-Object -ExpandProperty Caption)
      powershell = $PSVersionTable.PSVersion.ToString()
    }
    detected_processes = $processes
    searched_roots = $dataRoots
    source_candidates = $sources
    copied_file_count = $copiedFiles.Count
    copied_files = $copiedFiles
    warnings = $warnings
    notes = @(
      "Este pacote contem dados operacionais sensiveis.",
      "Guarde e transfira o ZIP apenas por canal confiavel.",
      "Nao apague nada do PC antigo antes de validar a importacao no sistema novo."
    )
  }

  $manifest | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

  if (!$SkipArchive) {
    $zipPath = Join-Path $OutputRoot "$exportName.zip"
    if (Test-Path -LiteralPath $zipPath) {
      Remove-Item -LiteralPath $zipPath -Force
    }

    Compress-Archive -LiteralPath (Join-Path $exportDir "*") -DestinationPath $zipPath -Force
    $zipHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath).Hash.ToLowerInvariant()
    Write-Host "ZIP: $zipPath"
    Write-Host "SHA256: $zipHash"
  }

  Write-Host "Pacote gerado com sucesso."
  Write-Host "Manifesto: $manifestPath"
  if ($warnings.Count -gt 0) {
    Write-Host "Avisos:"
    $warnings | ForEach-Object { Write-Host "- $_" }
  }
} finally {
  Stop-Transcript | Out-Null
}
