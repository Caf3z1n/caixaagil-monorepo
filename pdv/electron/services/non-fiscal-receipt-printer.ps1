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
      message = 'Layout validado sem enviar para a impressora.'
    } | ConvertTo-Json -Compress
    return
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

  @{
    status = 'printed'
    printer = $resolvedPrinter
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
