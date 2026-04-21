import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
  allowedDevOrigins: ["192.168.2.66", "192.168.2.*"],
};

export default nextConfig;
