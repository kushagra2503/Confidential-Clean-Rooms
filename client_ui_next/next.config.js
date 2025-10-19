/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Disable problematic network features
    serverExternalPackages: [],
  },
  // Webpack configuration to avoid network issues
  webpack: (config, { dev }) => {
    if (dev) {
      // Disable file watching for problematic directories
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ['**/node_modules', '**/.git', '**/.next'],
      };
    }
    return config;
  },
};

module.exports = nextConfig;
