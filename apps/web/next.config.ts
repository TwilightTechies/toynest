import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ["@toynest/core", "@toynest/ai", "@toynest/adapters"],
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Product photos are uploaded one per server-action call (ADR-017): up to 5 MB plus form overhead.
    serverActions: { bodySizeLimit: "6mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
