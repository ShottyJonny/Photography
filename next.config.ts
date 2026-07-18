import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    // Derivatives bucket is public; ingest slice adds the remote pattern.
    remotePatterns: [],
  },
}

export default nextConfig
