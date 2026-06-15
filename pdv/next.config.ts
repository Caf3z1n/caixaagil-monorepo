import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: ".next",
  output: "export",
  trailingSlash: true,
  devIndicators: false,
  images: {
    unoptimized: true
  },
  outputFileTracingRoot: path.resolve(process.cwd()),
  turbopack: {
    root: process.cwd()
  }
};

export default nextConfig;
