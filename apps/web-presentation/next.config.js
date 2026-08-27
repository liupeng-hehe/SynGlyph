/** @type {import('next').NextConfig} */
const apiInternal = process.env.SYNGLYPH_API_INTERNAL || "http://127.0.0.1:8000";

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "upload.wikimedia.org",
        pathname: "/wikipedia/commons/**",
      },
    ],
  },

  // pnpm + hoisted deps: compile these from source so server/client chunks stay consistent.
  transpilePackages: ["three", "@react-three/fiber", "@react-three/drei", "@react-pdf/renderer", "@synglyph/shared"],

  // Proxy lab API after Next has resolved `/_next/static`, `public/`, etc., so dev
  // refreshes never treat static chunks as rewrites.
  async rewrites() {
    return {
      afterFiles: [
        {
          source: "/api/lab/:path*",
          destination: `${apiInternal}/api/lab/:path*`,
        },
        {
          source: "/api/colorrec/:path*",
          destination: `${apiInternal}/api/colorrec/:path*`,
        },
      ],
    };
  },

  // On macOS, native file watching can race with rapid rebuilds and leave the dev
  // server serving HTML that references missing `/_next/static/*` (404 on layout.css / chunks).
  // Set NEXT_WEBPACK_POLL_MS=1000 (or use `pnpm dev:poll`) if you see unstyled pages after refresh.
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer && process.env.NEXT_WEBPACK_POLL_MS) {
      const ms = Number(process.env.NEXT_WEBPACK_POLL_MS);
      if (Number.isFinite(ms) && ms > 0) {
        config.watchOptions = {
          ...config.watchOptions,
          poll: ms,
          aggregateTimeout: 300,
        };
      }
    }
    return config;
  },
};

module.exports = nextConfig;
