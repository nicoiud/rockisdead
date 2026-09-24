import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Comprobantes (4 MB) e importaciones masivas de productos
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
