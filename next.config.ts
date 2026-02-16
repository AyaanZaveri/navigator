import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  distDir: '.next',
  output: 'standalone',
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
