const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enables `next build` output usable by Docker (see apps/web-english/Dockerfile).
  output: "standalone",
  experimental: {
    outputFileTracingRoot: path.join(__dirname, "../../"),
  },
  transpilePackages: [
    "@synglyph/shared",
    "@synglyph/annotation-core",
    "@synglyph/english-annotation-core",
  ],
  /**
   * Avoid PackFileCacheStrategy ENOENT on missing *.pack.gz when .next was cleared while
   * dev was running, or when disk cache races — memory cache is slower but stable.
   */
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = { type: "memory" };
    }
    return config;
  },
};

module.exports = nextConfig;
