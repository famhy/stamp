/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  // Allow access from any IP address on the local network
  async rewrites() {
    return []
  },
}

module.exports = nextConfig
