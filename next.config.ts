import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
