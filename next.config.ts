import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  distDir: '.next',
  output: 'standalone',
  // Signed desktop bundles are immutable; keep the bounded Next cache in memory.
  experimental: {
    isrFlushToDisk: process.env.NAVIGATOR_DESKTOP !== '1',
  },
  turbopack: {
    root: process.cwd(),
  },
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      {
        source: "/episode/:id*",
        destination: "/series/:id*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
