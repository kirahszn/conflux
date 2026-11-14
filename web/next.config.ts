import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // NEXT_DIST_DIR lets a local mainnet build sit beside the testnet one (e.g. .next-mainnet).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The landing page moved from /about to /; the dashboard Overview lives at /overview.
  async redirects() {
    return [{ source: "/about", destination: "/", permanent: false }];
  },
};

export default nextConfig;
