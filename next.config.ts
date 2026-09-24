import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Necesario para el Dockerfile: copia solo lo imprescindible (ver deploy/Dockerfile)
  output: "standalone",
  experimental: {
    serverActions: {
      // Comprobantes (4 MB) e importaciones masivas de productos
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
