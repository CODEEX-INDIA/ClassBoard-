/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: '50mb' } },
  webpack(config) {
    config.resolve.alias.canvas = false;
    return config;
  },
};
export default nextConfig;
