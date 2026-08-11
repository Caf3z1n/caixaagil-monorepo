import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const printerScriptPath = fileURLToPath(
  new URL("../electron/services/non-fiscal-receipt-printer.ps1", import.meta.url)
);
const printerScript = readFileSync(printerScriptPath, "utf8");

type ReferencePage = {
  body: string[];
  header: string[];
};

function paginateReceiptsReference(lines: string[], maxLinesPerPage = 150): ReferencePage[] {
  const pages: ReferencePage[] = [];
  let offset = 0;
  let pageNumber = 1;
  let activeSection = "";

  while (offset < lines.length) {
    const header = pageNumber === 1
      ? []
      : [
          "RESUMO DO TURNO (CONT.)",
          `PAGINA ${pageNumber}`,
          ...(activeSection ? [`${activeSection} (CONT.)`] : []),
          "-".repeat(32)
        ];
    const capacity = maxLinesPerPage - header.length;
    const body: string[] = [];

    while (offset < lines.length && body.length < capacity) {
      const current = lines[offset];
      const next = lines[offset + 1] ?? "";
      const startsAmountPair = !/^[+-]?R\$/.test(current) && /^[+-]?R\$/.test(next);

      if (startsAmountPair && capacity - body.length < 2 && body.length > 0) {
        break;
      }

      body.push(current);
      if (current.trim() === "RECEBIMENTOS") {
        activeSection = "RECEBIMENTOS";
      }
      offset += 1;
    }

    pages.push({ body, header });
    pageNumber += 1;
  }

  return pages;
}

test("renderer térmico usa paginação real e DryRun sem acessar impressora", () => {
  assert.match(printerScript, /function Split-ThermalReceiptPages\s*\{/);
  assert.match(printerScript, /function New-ThermalContinuationLines\s*\{/);
  assert.match(printerScript, /function Get-ThermalKeepTogetherCount\s*\{/);
  assert.match(printerScript, /\$continuationLines\s*=\s*@\(\)\s*\r?\n\s*if \(\$pageNumber -gt 1\)/);
  assert.doesNotMatch(printerScript, /\$continuationLines\s*=\s*if \(\$pageNumber -gt 1\)/);
  assert.match(printerScript, /\$nextLineIsAmount\s*=\s*\$nextLine\s*-match/);
  assert.match(printerScript, /\$thermalPaginationState\s*=\s*@\{\s*pageOffset\s*=\s*0\s*\}/);
  assert.match(
    printerScript,
    /\$e\.HasMorePages\s*=\s*\$thermalPaginationState\.pageOffset\s*-lt\s*\$thermalPages\.Count/
  );
  assert.doesNotMatch(printerScript, /DrawString\(\$thermalText/);
  assert.match(printerScript, /physicalPrint\s*=\s*\$false/);
  assert.ok(
    printerScript.indexOf("if ($DryRun)") < printerScript.indexOf("$resolvedPrinter = Resolve-PrinterName"),
    "DryRun deve retornar antes de consultar impressoras instaladas"
  );
});

test("plano estático preserva muitos recebimentos, pares monetários e largura de 32 colunas", () => {
  const receiptLines = Array.from({ length: 240 }, (_, index) => [
    `Parcela ${String(index + 1).padStart(3, "0")} - Cliente`,
    `R$ ${(index + 1).toFixed(2).replace(".", ",")}`
  ]).flat();
  const sourceLines = [
    "CAIXA AGIL",
    "-".repeat(32),
    "RESUMO DO TURNO",
    "-".repeat(32),
    "",
    "-".repeat(32),
    "RECEBIMENTOS",
    "-".repeat(32),
    ...receiptLines,
    "TOTAL RECEBIMENTOS",
    "R$ 28.920,00"
  ];
  const pages = paginateReceiptsReference(sourceLines);
  const restoredSource = pages.flatMap((page) => page.body);

  assert.ok(pages.length > 1);
  assert.deepEqual(restoredSource, sourceLines, "nenhuma linha de recebimento pode ser cortada ou duplicada");
  assert.ok(
    pages.slice(1).some((page) => page.header.includes("RECEBIMENTOS (CONT.)")),
    "páginas de continuação devem identificar a seção Recebimentos"
  );

  for (const page of pages) {
    const allLines = [...page.header, ...page.body];

    assert.ok(allLines.length <= 150);
    assert.ok(allLines.every((line) => line.length <= 32));
    assert.doesNotMatch(page.body.at(-1) ?? "", /^Parcela\s/, "descrição e valor devem ficar na mesma página");
  }
});

test("DryRun real pagina muitos recebimentos sem imprimir no Windows", {
  skip: process.platform !== "win32"
}, () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "caixaagil-print-layout-"));
  const payloadPath = join(temporaryDirectory, "payload.json");
  const receiptLines = Array.from({ length: 240 }, (_, index) => [
    `Parcela ${String(index + 1).padStart(3, "0")} - Cliente`,
    `R$ ${(index + 1).toFixed(2).replace(".", ",")}`
  ]).flat();

  try {
    writeFileSync(payloadPath, JSON.stringify({
      type: "resumo-turno",
      title: "RESUMO DO TURNO",
      companyName: "CAIXA AGIL",
      companyLines: [],
      fields: [],
      sections: [{
        title: "Recebimentos",
        kind: "preformatted",
        content: receiptLines.join("\n")
      }],
      preferredPrinterPatterns: []
    }), "utf8");

    const result = spawnSync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      printerScriptPath,
      "-PayloadPath",
      payloadPath,
      "-DryRun"
    ], { encoding: "utf8" });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1) ?? "{}");

    assert.equal(report.status, "dry-run");
    assert.equal(report.mode, "thermal-layout");
    assert.equal(report.physicalPrint, false);
    assert.equal(report.width, 32);
    assert.equal(report.overflowLines, 0);
    assert.ok(report.pages > 1);
    assert.equal(report.hasContinuation, true);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
