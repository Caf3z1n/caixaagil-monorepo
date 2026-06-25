import { NextResponse } from "next/server";

type GitHubReleaseAsset = {
  browser_download_url?: string;
  name?: string;
};

type GitHubRelease = {
  assets?: GitHubReleaseAsset[];
};

const latestReleaseApiUrl = "https://api.github.com/repos/Caf3z1n/caixaagil-monorepo/releases/latest";
const fallbackDownloadUrl =
  "https://github.com/Caf3z1n/caixaagil-monorepo/releases/latest/download/caixa-agil-setup-v0.3.exe";
const versionedInstallerPattern = /^caixa-agil-setup-v\d+\.\d+(?:\.\d+)?\.exe$/i;

export const dynamic = "force-dynamic";

export async function GET() {
  const configuredDownloadUrl = process.env.PDV_DOWNLOAD_URL;

  try {
    const response = await fetch(latestReleaseApiUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "caixaagil-web"
      },
      next: { revalidate: 60 }
    });

    if (response.ok) {
      const release = await response.json() as GitHubRelease;
      const installer = release.assets?.find((asset) =>
        Boolean(asset.browser_download_url && asset.name && versionedInstallerPattern.test(asset.name))
      );

      if (installer?.browser_download_url) {
        return NextResponse.redirect(installer.browser_download_url, 307);
      }
    }
  } catch {
    // Fallback abaixo mantém o download funcional mesmo se a API do GitHub oscilar.
  }

  return NextResponse.redirect(configuredDownloadUrl || fallbackDownloadUrl, 307);
}
