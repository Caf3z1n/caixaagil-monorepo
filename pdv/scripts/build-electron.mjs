import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(resolve(projectRoot, "package.json"), "utf8"));

function getInstallerVersion(version) {
  const parts = version.split(".");

  if (parts.length === 3 && parts[2] === "0") {
    return `${parts[0]}.${parts[1]}`;
  }

  return version;
}

const installerVersion = getInstallerVersion(packageJson.version);
const installerBaseName = `caixa-agil-setup-v${installerVersion}`;
const electronBuilderCli = resolve(projectRoot, "node_modules", "electron-builder", "cli.js");

const result = spawnSync(
  process.execPath,
  [electronBuilderCli, `--config.artifactName=${installerBaseName}.\${ext}`, ...process.argv.slice(2)],
  {
    cwd: projectRoot,
    env: {
      ...process.env,
      PDV_INSTALLER_BASENAME: installerBaseName,
      PDV_RELEASE_VERSION: installerVersion
    },
    stdio: "inherit"
  }
);

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);
