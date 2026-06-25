import { rm } from "node:fs/promises";
import { join } from "node:path";

const optionalWindowsRuntimeFiles = [
  "dxcompiler.dll",
  "dxil.dll",
  "vulkan-1.dll",
  "vk_swiftshader.dll",
  "vk_swiftshader_icd.json"
];

export default async function afterPack(context) {
  if (context.electronPlatformName !== "win32") {
    return;
  }

  await Promise.all(
    optionalWindowsRuntimeFiles.map((fileName) =>
      rm(join(context.appOutDir, fileName), { force: true })
    )
  );
}
