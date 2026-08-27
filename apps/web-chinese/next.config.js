/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@synglyph/shared",
    "@synglyph/annotation-core",
    "@synglyph/chinese-glyph-core",
  ],
};

module.exports = nextConfig;
