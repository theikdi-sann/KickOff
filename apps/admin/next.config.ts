import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@kickoff/shared"],
  devIndicators: false,
  allowedDevOrigins: ["192.168.88.64"],
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
