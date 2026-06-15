import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
  async redirects() {
    return [
      {
        source: "/home",
        destination: "/inicio",
        permanent: true
      },
      {
        source: "/home/conta",
        destination: "/conta",
        permanent: true
      },
      {
        source: "/home/relatorios",
        destination: "/relatorios",
        permanent: true
      },
      {
        source: "/home/subcontas",
        destination: "/subcontas",
        permanent: true
      }
    ];
  },
  images: {
    unoptimized: true
  },
  turbopack: {
    root: process.cwd()
  },
  outputFileTracingRoot: path.resolve(process.cwd())
};

export default nextConfig;
