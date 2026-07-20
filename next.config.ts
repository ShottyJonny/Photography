import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // sharp is a native binary. It must not be bundled by the server compiler --
  // it is required at runtime from node_modules instead. Verified present in
  // Next 16's config types (config-shared.d.ts: serverExternalPackages?: string[]).
  serverExternalPackages: ['sharp'],
  images: {
    // Intentionally empty. The storefront renders photographs through a raw
    // <picture> (components/store/Plate.tsx), never next/image, so the
    // derivatives bucket needs no remote pattern.
    remotePatterns: [],
  },
}

export default nextConfig
