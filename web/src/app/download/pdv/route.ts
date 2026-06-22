import { NextResponse } from "next/server";

const fallbackDownloadUrl =
  "https://github.com/Caf3z1n/caixaagil-monorepo/releases/latest/download/caixaagil-pdv-setup.exe";

export const dynamic = "force-dynamic";

export function GET() {
  const downloadUrl = process.env.PDV_DOWNLOAD_URL || fallbackDownloadUrl;

  return NextResponse.redirect(downloadUrl, 307);
}
