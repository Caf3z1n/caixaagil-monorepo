import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
  images: {
    unoptimized: true
  },
  turbopack: {
    root: process.cwd()
  },
  outputFileTracingRoot: path.resolve(process.cwd())
};

export default nextConfig;
