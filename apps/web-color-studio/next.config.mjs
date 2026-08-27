/** @type {import('next').NextConfig} */
const apiInternal = process.env.SYNGLYPH_API_INTERNAL || "http://127.0.0.1:8000";

const nextConfig = {
  transpilePackages: ["@synglyph/shared", "@react-pdf/renderer"],

  async rewrites() {
    return {
      afterFiles: [
        {
          source: "/api/lab/:path*",
          destination: `${apiInternal}/api/lab/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
