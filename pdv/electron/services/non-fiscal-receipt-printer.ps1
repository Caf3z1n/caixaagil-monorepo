param(
  [Parameter(Mandatory = $true)]
  [string]$PayloadPath,

  [string]$PrinterName,

  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

function Get-TextValue {
  param([object]$Value)

  if ($null -eq $Value) {
    return ''
  }

  return [string]$Value
}

function Get-ObjectPropertyValue {
  param(
    [object]$Object,
    [string]$Name
  )

  if ($null -eq $Object) {
    return ''
  }

  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property) {
    return ''
  }

  return Get-TextValue $property.Value
}

function New-TextFormat {
  param([System.Drawing.StringAlignment]$Alignment)

  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = $Alignment
  $format.LineAlignment = [System.Drawing.StringAlignment]::Near
  $format.Trimming = [System.Drawing.StringTrimming]::Word
  return $format
}

function Measure-TextHeight {
  param(
    [System.Drawing.Graphics]$Graphics,
    [string]$Text,
    [System.Drawing.Font]$Font,
    [int]$Width,
    [System.Drawing.StringFormat]$Format
  )

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return 0
  }

  $layout = New-Object System.Drawing.SizeF([single]$Width, [single]2000)
  $size = $Graphics.MeasureString($Text, $Font, $layout, $Format)
  $baseHeight = [Math]::Ceiling($Font.GetHeight($Graphics))
  return [Math]::Max([int][Math]::Ceiling($size.Height), [int]$baseHeight)
}

function Draw-TextBlock {
  param(
    [System.Drawing.Graphics]$Graphics,
    [string]$Text,
    [System.Drawing.Font]$Font,
    [System.Drawing.Brush]$Brush,
    [int]$X,
    [int]$Y,
    [int]$Width,
    [System.Drawing.StringFormat]$Format
  )

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return 0
  }

  $height = Measure-TextHeight -Graphics $Graphics -Text $Text -Font $Font -Width $Width -Format $Format
  $rect = New-Object System.Drawing.RectangleF([single]$X, [single]$Y, [single]$Width, [single]($height + 5))
  $Graphics.DrawString($Text, $Font, $Brush, $rect, $Format)
  return $height
}

function Get-InstalledPrinters {
  $printers = @()

  foreach ($printer in [System.Drawing.Printing.PrinterSettings]::InstalledPrinters) {
    $name = [string]$printer
    if (-not [string]::IsNullOrWhiteSpace($name)) {
      $printers += $name
    }
  }

  return $printers
}

function Get-DefaultPrinterName {
  $settings = New-Object System.Drawing.Printing.PrinterSettings

  if ($settings -and $settings.IsValid -and -not [string]::IsNullOrWhiteSpace($settings.PrinterName)) {
    return $settings.PrinterName
  }

  return $null
}

function Resolve-PrinterName {
  param(
    [string]$RequestedPrinterName,
    [string]$PayloadPrinterName,
    [object]$PreferredPatterns
  )

  $installedPrinters = Get-InstalledPrinters

  if ($installedPrinters.Count -eq 0) {
    throw 'Nenhuma impressora instalada foi encontrada no Windows.'
  }

  foreach ($candidate in @($RequestedPrinterName, $PayloadPrinterName)) {
    if ([string]::IsNullOrWhiteSpace($candidate)) {
      continue
    }

    $match = $installedPrinters | Where-Object { $_ -ieq $candidate } | Select-Object -First 1

    if ($match) {
      return $match
    }
  }

  $defaultPrinter = Get-DefaultPrinterName
  if (-not [string]::IsNullOrWhiteSpace($defaultPrinter)) {
    return $defaultPrinter
  }

  foreach ($pattern in @($PreferredPatterns)) {
    $text = [string]$pattern

    if ([string]::IsNullOrWhiteSpace($text)) {
      continue
    }

    $match = $installedPrinters | Where-Object {
      $_ -like "*$text*" -or $_ -match [Regex]::Escape($text)
    } | Select-Object -First 1

    if ($match) {
      return $match
    }
  }

  $thermalMatch = $installedPrinters | Where-Object {
    $_ -match 'TANCA|POS-|EPSON TM|BEMATECH|ELGIN|DARUMA|TERMICA|THERMAL'
  } | Select-Object -First 1

  if ($thermalMatch) {
    return $thermalMatch
  }

  return $installedPrinters[0]
}

function Get-PrinterQueueJobs {
  param([string]$PrinterName)

  if ([string]::IsNullOrWhiteSpace($PrinterName)) {
    return @()
  }

  try {
    return @(
      Get-CimInstance -ClassName Win32_PrintJob -ErrorAction Stop |
        Where-Object {
          $jobName = [string]$_.Name
          $jobName.StartsWith("$PrinterName,")
        }
    )
  } catch {
    return @()
  }
}

function Wait-PrinterQueueIdle {
  param(
    [string]$PrinterName,
    [int]$TimeoutMs = 30000,
    [int]$SettleMs = 1600
  )

  $watch = [System.Diagnostics.Stopwatch]::StartNew()
  $lastCount = 0

  do {
    $jobs = @(Get-PrinterQueueJobs -PrinterName $PrinterName)
    $lastCount = $jobs.Count

    if ($lastCount -eq 0) {
      if ($SettleMs -gt 0) {
        Start-Sleep -Milliseconds $SettleMs
      }

      return @{
        status = 'idle'
        waitedMs = [int]$watch.ElapsedMilliseconds
        pendingJobs = 0
      }
    }

    Start-Sleep -Milliseconds 500
  } while ($watch.ElapsedMilliseconds -lt $TimeoutMs)

  return @{
    status = 'timeout'
    waitedMs = [int]$watch.ElapsedMilliseconds
    pendingJobs = $lastCount
  }
}

function Clear-PrinterQueueJobs {
  param(
    [string]$PrinterName,
    [int]$JobId = -1,
    [string]$DocumentName = ''
  )

  if ([string]::IsNullOrWhiteSpace($PrinterName)) {
    return
  }

  for ($attempt = 0; $attempt -lt 8; $attempt++) {
    try {
      $jobs = @(Get-PrintJob -PrinterName $PrinterName -ErrorAction Stop)
      $matchedJobs = @()

      foreach ($job in $jobs) {
        $matchesJobId = $JobId -gt 0 -and [int]$job.ID -eq $JobId
        $matchesDocument = -not [string]::IsNullOrWhiteSpace($DocumentName) -and [string]$job.DocumentName -eq $DocumentName
        $removeAnyVisibleJob = $JobId -le 0 -and [string]::IsNullOrWhiteSpace($DocumentName)

        if ($matchesJobId -or $matchesDocument -or $removeAnyVisibleJob) {
          $matchedJobs += $job
          $job | Remove-PrintJob -ErrorAction SilentlyContinue
        }
      }

      if ($matchedJobs.Count -eq 0) {
        return
      }
    } catch {
      return
    }

    Start-Sleep -Milliseconds 800
  }
}

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class CaixaAgilRawPrinter
{
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DOCINFOA
  {
    [MarshalAs(UnmanagedType.LPStr)]
    public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)]
    public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)]
    public string pDataType;
  }

  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

  [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern Int32 StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

  [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

  public static Int32 SendBytes(string printerName, string documentName, byte[] bytes)
  {
    IntPtr printer = IntPtr.Zero;
    IntPtr unmanagedBytes = IntPtr.Zero;
    Int32 jobId = 0;

    DOCINFOA docInfo = new DOCINFOA();
    docInfo.pDocName = documentName;
    docInfo.pDataType = "RAW";

    try
    {
      if (!OpenPrinter(printerName.Normalize(), out printer, IntPtr.Zero))
      {
        throw new InvalidOperationException("OpenPrinter falhou: " + Marshal.GetLastWin32Error());
      }

      jobId = StartDocPrinter(printer, 1, docInfo);
      if (jobId == 0)
      {
        throw new InvalidOperationException("StartDocPrinter falhou: " + Marshal.GetLastWin32Error());
      }

      if (!StartPagePrinter(printer))
      {
        throw new InvalidOperationException("StartPagePrinter falhou: " + Marshal.GetLastWin32Error());
      }

      unmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
      Marshal.Copy(bytes, 0, unmanagedBytes, bytes.Length);

      int written = 0;
      if (!WritePrinter(printer, unmanagedBytes, bytes.Length, out written) || written != bytes.Length)
      {
        throw new InvalidOperationException("WritePrinter falhou: " + Marshal.GetLastWin32Error());
      }

      EndPagePrinter(printer);
      EndDocPrinter(printer);
      return jobId;
    }
    finally
    {
      if (unmanagedBytes != IntPtr.Zero)
      {
        Marshal.FreeCoTaskMem(unmanagedBytes);
      }

      if (printer != IntPtr.Zero)
      {
        ClosePrinter(printer);
      }
    }
  }
}
"@

function Normalize-RawReceiptText {
  param([object]$Value)

  $text = Get-TextValue $Value

  if ([string]::IsNullOrWhiteSpace($text)) {
    return ''
  }

  $text = $text.Replace([char]0x00A0, ' ')
  $normalized = $text.Normalize([System.Text.NormalizationForm]::FormD)
  $builder = New-Object System.Text.StringBuilder

  foreach ($char in $normalized.ToCharArray()) {
    if ([System.Globalization.CharUnicodeInfo]::GetUnicodeCategory($char) -ne [System.Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$builder.Append($char)
    }
  }

  return ($builder.ToString() -replace '[^\x09\x0A\x0D\x20-\x7E]', '').Trim()
}

function Split-RawReceiptLines {
  param(
    [string]$Text,
    [int]$Width = 42
  )

  $normalizedText = Normalize-RawReceiptText $Text

  if ([string]::IsNullOrWhiteSpace($normalizedText)) {
    return @()
  }

  $lines = @()

  foreach ($sourceLine in ($normalizedText -split "`r?`n")) {
    $words = @($sourceLine -split '\s+' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $current = ''

    foreach ($word in $words) {
      if ($word.Length -gt $Width) {
        if (-not [string]::IsNullOrWhiteSpace($current)) {
          $lines += $current
          $current = ''
        }

        for ($index = 0; $index -lt $word.Length; $index += $Width) {
          $lines += $word.Substring($index, [Math]::Min($Width, $word.Length - $index))
        }

        continue
      }

      $candidate = if ([string]::IsNullOrWhiteSpace($current)) { $word } else { "$current $word" }

      if ($candidate.Length -le $Width) {
        $current = $candidate
      } else {
        $lines += $current
        $current = $word
      }
    }

    if (-not [string]::IsNullOrWhiteSpace($current)) {
      $lines += $current
    }
  }

  return $lines
}

function Add-RawBytes {
  param(
    [System.Collections.Generic.List[byte]]$Buffer,
    [byte[]]$Bytes
  )

  foreach ($byte in $Bytes) {
    [void]$Buffer.Add($byte)
  }
}

function Add-EscPosCommand {
  param(
    [System.Collections.Generic.List[byte]]$Buffer,
    [byte[]]$Bytes
  )

  Add-RawBytes -Buffer $Buffer -Bytes $Bytes
}

function Add-EscPosLine {
  param(
    [System.Collections.Generic.List[byte]]$Buffer,
    [System.Text.Encoding]$Encoding,
    [string]$Text = '',
    [string]$Align = 'left',
    [bool]$Bold = $false,
    [int]$Width = 42
  )

  $alignment = switch ($Align) {
    'center' { 1 }
    'right' { 2 }
    default { 0 }
  }

  Add-EscPosCommand -Buffer $Buffer -Bytes ([byte[]](0x1B, 0x61, $alignment))
  Add-EscPosCommand -Buffer $Buffer -Bytes ([byte[]](0x1B, 0x45, $(if ($Bold) { 1 } else { 0 })))

  $lines = if ([string]::IsNullOrWhiteSpace($Text)) { @('') } else { Split-RawReceiptLines -Text $Text -Width $Width }

  foreach ($line in $lines) {
    Add-RawBytes -Buffer $Buffer -Bytes $Encoding.GetBytes($line)
    Add-EscPosCommand -Buffer $Buffer -Bytes ([byte[]](0x0D, 0x0A))
  }

  Add-EscPosCommand -Buffer $Buffer -Bytes ([byte[]](0x1B, 0x45, 0))
  Add-EscPosCommand -Buffer $Buffer -Bytes ([byte[]](0x1B, 0x61, 0))
}

function New-PromissoryEscPosBytes {
  param([object]$Payload)

  $encoding = [System.Text.Encoding]::GetEncoding(850)
  $buffer = New-Object 'System.Collections.Generic.List[byte]'
  $width = 42
  $separator = '-' * $width

  Add-EscPosCommand -Buffer $buffer -Bytes ([byte[]](0x1B, 0x40))
  Add-EscPosCommand -Buffer $buffer -Bytes ([byte[]](0x1B, 0x74, 0x02))

  $companyName = Normalize-RawReceiptText (Get-ObjectPropertyValue -Object $Payload -Name 'companyName')
  if (-not [string]::IsNullOrWhiteSpace($companyName)) {
    Add-EscPosLine -Buffer $buffer -Encoding $encoding -Text $companyName.ToUpperInvariant() -Align 'center' -Bold $true -Width $width
  }

  foreach ($companyLine in @($Payload.companyLines)) {
    Add-EscPosLine -Buffer $buffer -Encoding $encoding -Text $companyLine -Align 'center' -Width $width
  }

  Add-EscPosLine -Buffer $buffer -Encoding $encoding -Text '' -Width $width
  Add-EscPosLine -Buffer $buffer -Encoding $encoding -Text $separator -Width $width
  Add-EscPosLine -Buffer $buffer -Encoding $encoding -Text (Get-ObjectPropertyValue -Object $Payload -Name 'title') -Align 'center' -Bold $true -Width $width
  Add-EscPosLine -Buffer $buffer -Encoding $encoding -Text $separator -Width $width
  Add-EscPosLine -Buffer $buffer -Encoding $encoding -Text (Get-ObjectPropertyValue -Object $Payload -Name 'subtitle') -Align 'center' -Width $width
  Add-EscPosLine -Buffer $buffer -Encoding $encoding -Text '' -Width $width

  $highlightLabel = Normalize-RawReceiptText (Get-ObjectPropertyValue -Object $Payload -Name 'highlightLabel')
  $highlightValue = Normalize-RawReceiptText (Get-ObjectPropertyValue -Object $Payload -Name 'highlightValue')

  if (-not [string]::IsNullOrWhiteSpace($highlightValue)) {
    Add-EscPosLine -Buffer $buffer -Encoding $encoding -Text $highlightLabel.ToUpperInvariant() -Align 'center' -Bold $true -Width $width
    Add-EscPosLine -Buffer $buffer -Encoding $encoding -Text $highlightValue -Align 'center' -Bold $true -Width $width
    Add-EscPosLine -Buffer $buffer -Encoding $encoding -Text $separator -Width $width
  }

  foreach ($field in @($Payload.fields)) {
    $fieldLabel = Normalize-RawReceiptText (Get-ObjectPropertyValue -Object $field -Name 'label')
    $fieldValue = Normalize-RawReceiptText (Get-ObjectPropertyValue -Object $field -Name 'value')

    if ([string]::IsNullOrWhiteSpace($fieldValue)) {
      continue
    }

    Add-EscPosLine -Buffer $buffer -Encoding $encoding -Text $fieldLabel.ToUpperInvariant() -Bold $true -Width $width
    Add-EscPosLine -Buffer $buffer -Encoding $encoding -Text $fieldValue -Width $width
  }

  foreach ($section in @($Payload.sections)) {
    $sectionTitle = Normalize-RawReceiptText (Get-ObjectPropertyValue -Object $section -Name 'title')
    $sectionContent = Normalize-RawReceiptText (Get-ObjectPropertyValue -Object $section -Name 'content')

    if ([string]::IsNullOrWhiteSpace($sectionTitle) -and [string]::IsNullOrWhiteSpace($sectionContent)) {
      continue
    }

    Add-EscPosLine -Buffer $buffer -Encoding $encoding -Text $separator -Width $width
    Add-EscPosLine -Buffer $buffer -Encoding $encoding -Text $sectionTitle.ToUpperInvariant() -Align 'center' -Bold $true -Width $width

    foreach ($line in ($sectionContent -split "`r?`n")) {
      Add-EscPosLine -Buffer $buffer -Encoding $encoding -Text $line -Width $width
    }
  }

  $footerNote = Normalize-RawReceiptText (Get-ObjectPropertyValue -Object $Payload -Name 'footerNote')
  if (-not [string]::IsNullOrWhiteSpace($footerNote)) {
    Add-EscPosLine -Buffer $buffer -Encoding $encoding -Text $separator -Width $width
    Add-EscPosLine -Buffer $buffer -Encoding $encoding -Text $footerNote -Align 'center' -Width $width
  }

  $signatureLabel = Normalize-RawReceiptText (Get-ObjectPropertyValue -Object $Payload -Name 'signatureLabel')
  $signatureName = Normalize-RawReceiptText (Get-ObjectPropertyValue -Object $Payload -Name 'signatureName')

  if (-not [string]::IsNullOrWhiteSpace($signatureLabel)) {
    Add-EscPosLine -Buffer $buffer -Encoding $encoding -Text '' -Width $width
    Add-EscPosLine -Buffer $buffer -Encoding $encoding -Text '______________________________' -Align 'center' -Width $width
    Add-EscPosLine -Buffer $buffer -Encoding $encoding -Text $signatureLabel -Align 'center' -Width $width

    if (-not [string]::IsNullOrWhiteSpace($signatureName)) {
      Add-EscPosLine -Buffer $buffer -Encoding $encoding -Text $signatureName.ToUpperInvariant() -Align 'center' -Bold $true -Width $width
    }
  }

  Add-EscPosCommand -Buffer $buffer -Bytes ([byte[]](0x1B, 0x64, 0x06))
  Add-EscPosCommand -Buffer $buffer -Bytes ([byte[]](0x1D, 0x56, 0x42, 0x00))
  Add-EscPosCommand -Buffer $buffer -Bytes ([byte[]](0x1D, 0x56, 0x41, 0x10))
  Add-EscPosCommand -Buffer $buffer -Bytes ([byte[]](0x1D, 0x56, 0x00))

  return $buffer.ToArray()
}

function Wrap-ThermalTextLine {
  param(
    [string]$Text,
    [int]$Width = 42
  )

  $normalizedText = Normalize-RawReceiptText $Text

  if ([string]::IsNullOrWhiteSpace($normalizedText)) {
    return @('')
  }

  return Split-RawReceiptLines -Text $normalizedText -Width $Width
}

function Add-ThermalTextLine {
  param(
    [System.Collections.Generic.List[string]]$Lines,
    [string]$Text = '',
    [int]$Width = 42,
    [string]$Align = 'left'
  )

  foreach ($line in (Wrap-ThermalTextLine -Text $Text -Width $Width)) {
    $normalizedLine = Normalize-RawReceiptText $line
    $outputLine = switch ($Align) {
      'center' {
        if ($normalizedLine.Length -ge $Width) { $normalizedLine } else { (' ' * [Math]::Floor(($Width - $normalizedLine.Length) / 2)) + $normalizedLine }
      }
      'right' {
        if ($normalizedLine.Length -ge $Width) { $normalizedLine } else { $normalizedLine.PadLeft($Width) }
      }
      default { $normalizedLine }
    }

    [void]$Lines.Add($outputLine)
  }
}

function Add-ThermalTextSeparator {
  param(
    [System.Collections.Generic.List[string]]$Lines,
    [int]$Width = 42
  )

  [void]$Lines.Add('-' * $Width)
}

function Add-ThermalPreformattedLine {
  param(
    [System.Collections.Generic.List[string]]$Lines,
    [string]$Text = '',
    [int]$Width = 32
  )

  $normalizedLine = Normalize-RawReceiptText $Text

  if ([string]::IsNullOrWhiteSpace($normalizedLine)) {
    [void]$Lines.Add('')
    return
  }

  if ($normalizedLine -match '^ITEM\s+TOTAL$') {
    [void]$Lines.Add(('ITEM'.PadRight([Math]::Max($Width - 10, 10)) + ' ' + 'TOTAL'.PadLeft(9)).Substring(0, $Width))
    return
  }

  if ($normalizedLine.Length -le $Width) {
    [void]$Lines.Add($normalizedLine)
    return
  }

  if ($normalizedLine -match '^-+$') {
    [void]$Lines.Add('-' * $Width)
    return
  }

  $priceMatch = [Regex]::Match($normalizedLine, '^(?<name>.+?)\s{2,}(?<price>R\$\s*[\d\.,]+)$')
  if ($priceMatch.Success) {
    $nameWidth = [Math]::Max($Width - 10, 10)
    $name = Normalize-RawReceiptText $priceMatch.Groups['name'].Value
    $price = Normalize-RawReceiptText $priceMatch.Groups['price'].Value
    $name = if ($name.Length -gt $nameWidth) { $name.Substring(0, $nameWidth) } else { $name.PadRight($nameWidth) }
    $price = if ($price.Length -gt 9) { $price.Substring(0, 9) } else { $price.PadLeft(9) }
    [void]$Lines.Add("$name $price")
    return
  }

  $line = $normalizedLine
  while ($line.Length -gt $Width) {
    [void]$Lines.Add($line.Substring(0, $Width).TrimEnd())
    $line = $line.Substring($Width).TrimStart()
  }

  if (-not [string]::IsNullOrWhiteSpace($line)) {
    [void]$Lines.Add($line)
  }
}

function New-ReceiptThermalText {
  param(
    [object]$Payload,
    [int]$Width = 32
  )

  $width = $Width
  $lines = New-Object 'System.Collections.Generic.List[string]'
  $title = Normalize-RawReceiptText (Get-ObjectPropertyValue -Object $Payload -Name 'title')
  $subtitle = Normalize-RawReceiptText (Get-ObjectPropertyValue -Object $Payload -Name 'subtitle')
  $companyName = Normalize-RawReceiptText (Get-ObjectPropertyValue -Object $Payload -Name 'companyName')

  if (-not [string]::IsNullOrWhiteSpace($companyName)) {
    Add-ThermalTextLine -Lines $lines -Text $companyName.ToUpperInvariant() -Width $width -Align 'center'
  }

  foreach ($companyLine in @($Payload.companyLines)) {
    Add-ThermalTextLine -Lines $lines -Text $companyLine -Width $width -Align 'center'
  }

  [void]$lines.Add('')
  Add-ThermalTextSeparator -Lines $lines -Width $width
  Add-ThermalTextLine -Lines $lines -Text $title.ToUpperInvariant() -Width $width -Align 'center'
  Add-ThermalTextSeparator -Lines $lines -Width $width

  if (-not [string]::IsNullOrWhiteSpace($subtitle)) {
    Add-ThermalTextLine -Lines $lines -Text $subtitle -Width $width -Align 'center'
  }

  $highlightLabel = Normalize-RawReceiptText (Get-ObjectPropertyValue -Object $Payload -Name 'highlightLabel')
  $highlightValue = Normalize-RawReceiptText (Get-ObjectPropertyValue -Object $Payload -Name 'highlightValue')

  if (-not [string]::IsNullOrWhiteSpace($highlightValue)) {
    [void]$lines.Add('')
    Add-ThermalTextLine -Lines $lines -Text ($highlightLabel.ToUpperInvariant()) -Width $width -Align 'center'
    Add-ThermalTextLine -Lines $lines -Text $highlightValue -Width $width -Align 'center'
  }

  foreach ($field in @($Payload.fields)) {
    $fieldLabel = Normalize-RawReceiptText (Get-ObjectPropertyValue -Object $field -Name 'label')
    $fieldValue = Normalize-RawReceiptText (Get-ObjectPropertyValue -Object $field -Name 'value')

    if ([string]::IsNullOrWhiteSpace($fieldValue)) {
      continue
    }

    [void]$lines.Add('')
    Add-ThermalTextLine -Lines $lines -Text ($fieldLabel.ToUpperInvariant() + ':') -Width $width -Align 'center'
    Add-ThermalTextLine -Lines $lines -Text $fieldValue -Width $width -Align 'center'
  }

  foreach ($section in @($Payload.sections)) {
    $sectionTitle = Normalize-RawReceiptText (Get-ObjectPropertyValue -Object $section -Name 'title')
    $sectionKind = Normalize-RawReceiptText (Get-ObjectPropertyValue -Object $section -Name 'kind')
    $sectionContent = Normalize-RawReceiptText (Get-ObjectPropertyValue -Object $section -Name 'content')

    if ([string]::IsNullOrWhiteSpace($sectionTitle) -and [string]::IsNullOrWhiteSpace($sectionContent)) {
      continue
    }

    [void]$lines.Add('')
    Add-ThermalTextSeparator -Lines $lines -Width $width
    Add-ThermalTextLine -Lines $lines -Text $sectionTitle.ToUpperInvariant() -Width $width -Align 'center'
    Add-ThermalTextSeparator -Lines $lines -Width $width

    foreach ($contentLine in ($sectionContent -split "`r?`n")) {
      if ($sectionKind -ieq 'preformatted') {
        Add-ThermalPreformattedLine -Lines $lines -Text $contentLine -Width $width
      } else {
        Add-ThermalTextLine -Lines $lines -Text $contentLine -Width $width
      }
    }
  }

  $footerNote = Normalize-RawReceiptText (Get-ObjectPropertyValue -Object $Payload -Name 'footerNote')
  if (-not [string]::IsNullOrWhiteSpace($footerNote)) {
    [void]$lines.Add('')
    Add-ThermalTextSeparator -Lines $lines -Width $width
    Add-ThermalTextLine -Lines $lines -Text $footerNote -Width $width -Align 'center'
  }

  $signatureLabel = Normalize-RawReceiptText (Get-ObjectPropertyValue -Object $Payload -Name 'signatureLabel')
  $signatureName = Normalize-RawReceiptText (Get-ObjectPropertyValue -Object $Payload -Name 'signatureName')

  if (-not [string]::IsNullOrWhiteSpace($signatureLabel)) {
    [void]$lines.Add('')
    [void]$lines.Add('')
    Add-ThermalTextLine -Lines $lines -Text '______________________________' -Width $width -Align 'center'
    Add-ThermalTextLine -Lines $lines -Text $signatureLabel -Width $width -Align 'center'

    if (-not [string]::IsNullOrWhiteSpace($signatureName)) {
      Add-ThermalTextLine -Lines $lines -Text $signatureName.ToUpperInvariant() -Width $width -Align 'center'
    }
  }

  [void]$lines.Add('')
  [void]$lines.Add('')
  [void]$lines.Add('')

  return ($lines -join "`r`n")
}

$payloadRaw = Get-Content -LiteralPath $PayloadPath -Raw -Encoding UTF8
if ([string]::IsNullOrWhiteSpace($payloadRaw)) {
  throw 'Payload do comprovante nao fiscal esta vazio.'
}

$payload = $payloadRaw | ConvertFrom-Json
$payloadPrinterName = Get-ObjectPropertyValue -Object $payload -Name 'printerName'
$preferredPatterns = @($payload.preferredPrinterPatterns)

$document = $null
$borderPen = $null
$separatorPen = $null
$fontCompany = $null
$fontCompanyLine = $null
$fontTitle = $null
$fontSubtitle = $null
$fontHighlightLabel = $null
$fontHighlightValue = $null
$fontFieldLabel = $null
$fontFieldValue = $null
$fontSectionTitle = $null
$fontSectionContent = $null
$fontFooter = $null
$brush = [System.Drawing.Brushes]::Black
$formatCenter = New-TextFormat -Alignment ([System.Drawing.StringAlignment]::Center)
$formatLeft = New-TextFormat -Alignment ([System.Drawing.StringAlignment]::Near)

try {
  $resolvedPrinter = Resolve-PrinterName -RequestedPrinterName $PrinterName -PayloadPrinterName $payloadPrinterName -PreferredPatterns $preferredPatterns

  $document = New-Object System.Drawing.Printing.PrintDocument
  $documentTitle = Get-ObjectPropertyValue -Object $payload -Name 'title'
  $document.DocumentName = if ([string]::IsNullOrWhiteSpace($documentTitle)) {
    'Comprovante nao fiscal'
  }
  else {
    $documentTitle
  }
  $document.PrintController = New-Object System.Drawing.Printing.StandardPrintController
  $document.OriginAtMargins = $true
  $document.PrinterSettings.PrinterName = $resolvedPrinter
  $document.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(5, 5, 6, 8)

  if (-not $document.PrinterSettings.IsValid) {
    throw 'Impressora nao fiscal invalida ou indisponivel.'
  }

  if ($DryRun) {
    @{
      status = 'dry-run'
      printer = $resolvedPrinter
      mode = 'validated'
      message = 'Layout validado sem enviar para a impressora.'
    } | ConvertTo-Json -Compress
    return
  }

  $queueWait = Wait-PrinterQueueIdle -PrinterName $resolvedPrinter

  if ($queueWait.status -ne 'idle') {
    throw "A impressora '$resolvedPrinter' ainda possui trabalho pendente na fila. Limpe a fila ou reinicie a impressora antes de tentar novamente."
  }

  $payloadType = Normalize-RawReceiptText (Get-ObjectPropertyValue -Object $payload -Name 'type')

  if (($payloadType -ieq 'promissoria') -or ($payloadType -ieq 'resumo-turno')) {
    $thermalWidth = 32
    $thermalText = New-ReceiptThermalText -Payload $payload -Width $thermalWidth
    $thermalLines = @($thermalText -split "`r?`n")
    $fontThermal = $null
    $thermalDocumentName = if (-not [string]::IsNullOrWhiteSpace($documentTitle)) {
      $documentTitle
    }
    elseif ($payloadType -ieq 'resumo-turno') {
      'RESUMO DO TURNO'
    }
    else {
      'NOTA PROMISSORIA'
    }
    $thermalPaperName = if ($payloadType -ieq 'resumo-turno') {
      'CaixaAgil Resumo Turno 72mm'
    }
    else {
      'CaixaAgil Promissoria 72mm'
    }
    $thermalMessage = if ($payloadType -ieq 'resumo-turno') {
      'Resumo do turno enviado em modo texto termico.'
    }
    else {
      'Promissoria enviada em modo texto termico.'
    }

    try {
      $document.DocumentName = $thermalDocumentName
      $document.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize(
        $thermalPaperName,
        284,
        [Math]::Min([Math]::Max(($thermalLines.Count * 20) + 90, 500), 3276)
      )
      $document.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(2, 2, 8, 16)
      $fontThermal = New-Object System.Drawing.Font('Courier New', 9.5, [System.Drawing.FontStyle]::Bold)

      $document.add_PrintPage([System.Drawing.Printing.PrintPageEventHandler]{
          param($sender, $e)

          $graphics = $e.Graphics
          $graphics.Clear([System.Drawing.Color]::White)
          $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::SingleBitPerPixelGridFit
          $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
          $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
          $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighSpeed

          $availableLeft = [int]$e.MarginBounds.Left
          $y = [int]$e.MarginBounds.Top
          $availableWidth = [Math]::Max([int]$e.MarginBounds.Width, 260)
          $sampleText = '0' * $thermalWidth
          $sampleSize = $graphics.MeasureString($sampleText, $fontThermal)
          $textWidth = [Math]::Min([Math]::Ceiling($sampleSize.Width) + 6, $availableWidth)
          $x = $availableLeft + [Math]::Max([Math]::Floor(($availableWidth - $textWidth) / 2), 0)
          $layout = New-Object System.Drawing.RectangleF([single]$x, [single]$y, [single]$textWidth, [single]($e.MarginBounds.Height + 240))
          $format = New-Object System.Drawing.StringFormat
          $format.Alignment = [System.Drawing.StringAlignment]::Near
          $format.LineAlignment = [System.Drawing.StringAlignment]::Near
          $format.FormatFlags = [System.Drawing.StringFormatFlags]::NoClip
          $format.Trimming = [System.Drawing.StringTrimming]::None

          try {
            $graphics.DrawString($thermalText, $fontThermal, $brush, $layout, $format)
          } finally {
            $format.Dispose()
          }

          $e.HasMorePages = $false
        })

      $document.Print()
      $finalQueueWait = Wait-PrinterQueueIdle -PrinterName $resolvedPrinter -TimeoutMs 60000 -SettleMs 1800

      if ($finalQueueWait.status -ne 'idle') {
        Clear-PrinterQueueJobs -PrinterName $resolvedPrinter -DocumentName $document.DocumentName
        throw "A impressora '$resolvedPrinter' recebeu o comprovante, mas o Windows nao concluiu o trabalho na fila. A fila foi limpa para proteger as proximas impressoes."
      }

      @{
        status = 'printed'
        printer = $resolvedPrinter
        mode = 'thermal-text'
        lines = $thermalLines.Count
        queueWait = $queueWait
        finalQueueWait = $finalQueueWait
        message = $thermalMessage
      } | ConvertTo-Json -Compress
      return
    } finally {
      if ($fontThermal) { $fontThermal.Dispose() }
    }
  }

  $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::Black, 1.5)
  $separatorPen = New-Object System.Drawing.Pen([System.Drawing.Color]::Black, 1.1)
  $fontCompany = New-Object System.Drawing.Font('Arial', 11, [System.Drawing.FontStyle]::Bold)
  $fontCompanyLine = New-Object System.Drawing.Font('Arial', 8.6, [System.Drawing.FontStyle]::Bold)
  $fontTitle = New-Object System.Drawing.Font('Arial', 12.5, [System.Drawing.FontStyle]::Bold)
  $fontSubtitle = New-Object System.Drawing.Font('Arial', 8.8, [System.Drawing.FontStyle]::Bold)
  $fontHighlightLabel = New-Object System.Drawing.Font('Arial', 8.6, [System.Drawing.FontStyle]::Bold)
  $fontHighlightValue = New-Object System.Drawing.Font('Arial', 17, [System.Drawing.FontStyle]::Bold)
  $fontFieldLabel = New-Object System.Drawing.Font('Arial', 7.9, [System.Drawing.FontStyle]::Bold)
  $fontFieldValue = New-Object System.Drawing.Font('Arial', 9.4, [System.Drawing.FontStyle]::Regular)
  $fontSectionTitle = New-Object System.Drawing.Font('Arial', 8.2, [System.Drawing.FontStyle]::Bold)
  $fontSectionContent = New-Object System.Drawing.Font('Courier New', 7.4, [System.Drawing.FontStyle]::Bold)
  $fontFooter = New-Object System.Drawing.Font('Arial', 8.1, [System.Drawing.FontStyle]::Bold)

  $document.add_PrintPage([System.Drawing.Printing.PrintPageEventHandler]{
      param($sender, $e)

      $graphics = $e.Graphics
      $graphics.Clear([System.Drawing.Color]::White)
      $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::SingleBitPerPixelGridFit
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

      $x = [int]$e.MarginBounds.Left
      $y = [int]$e.MarginBounds.Top
      $width = [int]$e.MarginBounds.Width

      if ($width -le 0) {
        $x = 6
        $width = [Math]::Max([int]$e.PageBounds.Width - 12, 220)
      }

      $companyName = Get-ObjectPropertyValue -Object $payload -Name 'companyName'
      $title = Get-ObjectPropertyValue -Object $payload -Name 'title'
      $subtitle = Get-ObjectPropertyValue -Object $payload -Name 'subtitle'
      $highlightLabel = Get-ObjectPropertyValue -Object $payload -Name 'highlightLabel'
      $highlightValue = Get-ObjectPropertyValue -Object $payload -Name 'highlightValue'
      $footerNote = Get-ObjectPropertyValue -Object $payload -Name 'footerNote'
      $signatureLabel = Get-ObjectPropertyValue -Object $payload -Name 'signatureLabel'
      $signatureName = Get-ObjectPropertyValue -Object $payload -Name 'signatureName'

      if (-not [string]::IsNullOrWhiteSpace($companyName)) {
        $y += (Draw-TextBlock -Graphics $graphics -Text $companyName -Font $fontCompany -Brush $brush -X $x -Y $y -Width $width -Format $formatCenter)
        $y += 2
      }

      foreach ($companyLine in @($payload.companyLines)) {
        $lineText = [string]$companyLine
        if ([string]::IsNullOrWhiteSpace($lineText)) {
          continue
        }

        $y += (Draw-TextBlock -Graphics $graphics -Text $lineText -Font $fontCompanyLine -Brush $brush -X $x -Y $y -Width $width -Format $formatCenter)
      }

      $y += 6

      if (-not [string]::IsNullOrWhiteSpace($title)) {
        $titleHeight = Measure-TextHeight -Graphics $graphics -Text $title -Font $fontTitle -Width $width -Format $formatCenter
        $titleRect = New-Object System.Drawing.Rectangle([int]$x, [int]$y, [int]$width, [int]($titleHeight + 14))
        $graphics.DrawRectangle($borderPen, $titleRect)
        [void](Draw-TextBlock -Graphics $graphics -Text $title -Font $fontTitle -Brush $brush -X ($x + 4) -Y ($y + 5) -Width ($width - 8) -Format $formatCenter)
        $y += $titleRect.Height
      }

      if (-not [string]::IsNullOrWhiteSpace($subtitle)) {
        $y += 4
        $y += (Draw-TextBlock -Graphics $graphics -Text $subtitle -Font $fontSubtitle -Brush $brush -X $x -Y $y -Width $width -Format $formatCenter)
      }

      if (-not [string]::IsNullOrWhiteSpace($highlightValue)) {
        $y += 8
        $boxHeight = 46
        $graphics.DrawRectangle($borderPen, $x, $y, $width, $boxHeight)

        if (-not [string]::IsNullOrWhiteSpace($highlightLabel)) {
          [void](Draw-TextBlock -Graphics $graphics -Text $highlightLabel.ToUpperInvariant() -Font $fontHighlightLabel -Brush $brush -X ($x + 4) -Y ($y + 5) -Width ($width - 8) -Format $formatCenter)
        }

        [void](Draw-TextBlock -Graphics $graphics -Text $highlightValue -Font $fontHighlightValue -Brush $brush -X ($x + 4) -Y ($y + 17) -Width ($width - 8) -Format $formatCenter)
        $y += $boxHeight + 8
      }

      foreach ($field in @($payload.fields)) {
        $fieldLabel = Get-ObjectPropertyValue -Object $field -Name 'label'
        $fieldValue = Get-ObjectPropertyValue -Object $field -Name 'value'

        if ([string]::IsNullOrWhiteSpace($fieldValue)) {
          continue
        }

        $graphics.DrawLine($separatorPen, [single]$x, [single]$y, [single]($x + $width), [single]$y)
        $y += 5
        $y += (Draw-TextBlock -Graphics $graphics -Text $fieldLabel.ToUpperInvariant() -Font $fontFieldLabel -Brush $brush -X $x -Y $y -Width $width -Format $formatLeft)
        $y += 1
        $y += (Draw-TextBlock -Graphics $graphics -Text $fieldValue -Font $fontFieldValue -Brush $brush -X $x -Y $y -Width $width -Format $formatLeft)
        $y += 5
      }

      foreach ($section in @($payload.sections)) {
        $sectionTitle = Get-ObjectPropertyValue -Object $section -Name 'title'
        $sectionKind = Get-ObjectPropertyValue -Object $section -Name 'kind'
        $sectionContent = Get-ObjectPropertyValue -Object $section -Name 'content'

        if ([string]::IsNullOrWhiteSpace($sectionTitle) -and [string]::IsNullOrWhiteSpace($sectionContent)) {
          continue
        }

        $graphics.DrawRectangle($borderPen, $x, $y, $width, 22)
        [void](Draw-TextBlock -Graphics $graphics -Text $sectionTitle.ToUpperInvariant() -Font $fontSectionTitle -Brush $brush -X ($x + 4) -Y ($y + 4) -Width ($width - 8) -Format $formatCenter)
        $y += 26

        if (-not [string]::IsNullOrWhiteSpace($sectionContent)) {
          $sectionFont = if ($sectionKind -eq 'preformatted') { $fontSectionContent } else { $fontFieldValue }
          $y += (Draw-TextBlock -Graphics $graphics -Text $sectionContent -Font $sectionFont -Brush $brush -X $x -Y $y -Width $width -Format $formatLeft)
          $y += 7
        }
      }

      if (-not [string]::IsNullOrWhiteSpace($footerNote)) {
        $graphics.DrawLine($separatorPen, [single]$x, [single]$y, [single]($x + $width), [single]$y)
        $y += 7
        $y += (Draw-TextBlock -Graphics $graphics -Text $footerNote -Font $fontFooter -Brush $brush -X $x -Y $y -Width $width -Format $formatCenter)
      }

      if (-not [string]::IsNullOrWhiteSpace($signatureLabel)) {
        $y += 20
        $lineY = $y + 12
        $graphics.DrawLine(
          $borderPen,
          [single]($x + 18),
          [single]$lineY,
          [single]($x + $width - 18),
          [single]$lineY
        )
        $y = $lineY + 4
        $y += (Draw-TextBlock -Graphics $graphics -Text $signatureLabel -Font $fontFooter -Brush $brush -X $x -Y $y -Width $width -Format $formatCenter)

        if (-not [string]::IsNullOrWhiteSpace($signatureName)) {
          $y += 2
          $y += (Draw-TextBlock -Graphics $graphics -Text $signatureName.ToUpperInvariant() -Font $fontFooter -Brush $brush -X $x -Y $y -Width $width -Format $formatCenter)
        }
      }

      $e.HasMorePages = $false
    })

  $document.Print()
  $finalQueueWait = Wait-PrinterQueueIdle -PrinterName $resolvedPrinter -TimeoutMs 45000 -SettleMs 1800

  if ($finalQueueWait.status -ne 'idle') {
    Clear-PrinterQueueJobs -PrinterName $resolvedPrinter -DocumentName $document.DocumentName
    throw "A impressora '$resolvedPrinter' recebeu o comprovante, mas o Windows nao concluiu o trabalho na fila. Verifique se a impressora esta ligada, com papel e sem erro, depois tente reimprimir."
  }

  @{
    status = 'printed'
    printer = $resolvedPrinter
    queueWait = $queueWait
    finalQueueWait = $finalQueueWait
    message = 'Comprovante enviado para impressao.'
  } | ConvertTo-Json -Compress
}
finally {
  if ($borderPen) { $borderPen.Dispose() }
  if ($separatorPen) { $separatorPen.Dispose() }
  if ($fontCompany) { $fontCompany.Dispose() }
  if ($fontCompanyLine) { $fontCompanyLine.Dispose() }
  if ($fontTitle) { $fontTitle.Dispose() }
  if ($fontSubtitle) { $fontSubtitle.Dispose() }
  if ($fontHighlightLabel) { $fontHighlightLabel.Dispose() }
  if ($fontHighlightValue) { $fontHighlightValue.Dispose() }
  if ($fontFieldLabel) { $fontFieldLabel.Dispose() }
  if ($fontFieldValue) { $fontFieldValue.Dispose() }
  if ($fontSectionTitle) { $fontSectionTitle.Dispose() }
  if ($fontSectionContent) { $fontSectionContent.Dispose() }
  if ($fontFooter) { $fontFooter.Dispose() }
  if ($document) { $document.Dispose() }
  if ($formatCenter) { $formatCenter.Dispose() }
  if ($formatLeft) { $formatLeft.Dispose() }
}
