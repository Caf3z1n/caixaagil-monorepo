const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createLocalPdvStore } = require("../electron/local-store.cjs");

function createHarness(userDataPath) {
  const handlers = new Map();
  const store = createLocalPdvStore({
    isPackaged: false,
    getPath(name) {
      assert.equal(name, "userData");
      return userDataPath;
    }
  });

  store.registerIpc({
    handle(channel, handler) {
      handlers.set(channel, handler);
    }
  });

  return {
    invoke(channel, payload) {
      const handler = handlers.get(channel);
      assert.ok(handler, `Handler não registrado: ${channel}`);
      return handler({}, payload);
    }
  };
}

function assertSafeTemporaryDirectory(directory) {
  const temporaryRoot = path.resolve(os.tmpdir());
  const resolvedDirectory = path.resolve(directory);
  assert.ok(resolvedDirectory.startsWith(`${temporaryRoot}${path.sep}`));
}

test("persiste o banco, cria backup íntegro e restaura após corrupção", async () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "caixaagil-local-store-"));
  const databasePath = path.join(userDataPath, "data", "caixa-agil-pdv.sqlite");
  const backupPath = `${databasePath}.backup-1`;

  try {
    const firstHarness = createHarness(userDataPath);
    const state = { sales: [{ id: "venda-1", total: 11.5 }] };

    await firstHarness.invoke("pdv-store:save-state", { scope: "usuario-3:pdv-2", state });

    assert.equal(fs.readFileSync(databasePath).subarray(0, 16).toString("binary"), "SQLite format 3\0");
    assert.equal(fs.readFileSync(backupPath).subarray(0, 16).toString("binary"), "SQLite format 3\0");
    assert.deepEqual(
      await firstHarness.invoke("pdv-store:load-state", { scope: "usuario-3:pdv-2" }),
      state
    );

    fs.writeFileSync(databasePath, Buffer.alloc(fs.statSync(databasePath).size));

    const recoveredHarness = createHarness(userDataPath);
    assert.deepEqual(
      await recoveredHarness.invoke("pdv-store:load-state", { scope: "usuario-3:pdv-2" }),
      state
    );
    assert.equal(fs.readFileSync(databasePath).subarray(0, 16).toString("binary"), "SQLite format 3\0");

    const quarantined = fs.readdirSync(path.dirname(databasePath))
      .filter((name) => name.startsWith("caixa-agil-pdv.corrompido-"));
    assert.equal(quarantined.length, 1);
  } finally {
    assertSafeTemporaryDirectory(userDataPath);
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});

test("interrompe a inicialização quando não existe cópia íntegra", async () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "caixaagil-local-store-"));
  const dataDirectory = path.join(userDataPath, "data");
  const databasePath = path.join(dataDirectory, "caixa-agil-pdv.sqlite");

  try {
    fs.mkdirSync(dataDirectory, { recursive: true });
    fs.writeFileSync(databasePath, Buffer.alloc(4096));

    const harness = createHarness(userDataPath);
    await assert.rejects(
      harness.invoke("pdv-store:load-state", { scope: "usuario-3:pdv-2" }),
      /banco local do PDV está corrompido/i
    );
  } finally {
    assertSafeTemporaryDirectory(userDataPath);
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});
