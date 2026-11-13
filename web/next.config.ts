import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The landing page moved from /about to /; the dashboard Overview lives at /overview.
  async redirects() {
    return [{ source: "/about", destination: "/", permanent: false }];
  },
};

export default nextConfig;
