import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ["@toynest/core", "@toynest/ai", "@toynest/adapters"],
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Product photos are uploaded one per server-action call (ADR-017): up to 4 MB plus form overhead,
    // which stays under Vercel's 4.5 MB request-body limit (ADR-020).
    serverActions: { bodySizeLimit: "4.5mb" },
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
