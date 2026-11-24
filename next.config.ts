import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Self-contained server output for the Docker image (node server.js).
  output: "standalone",
  // node:sqlite is a Node builtin; keep it out of the bundler graph.
  serverExternalPackages: ["exceljs"],
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
  },
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
