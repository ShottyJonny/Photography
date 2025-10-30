import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    open: true,
    // Use a unique port to avoid conflicts with other apps in this repo
    port: 5181,
    strictPort: true,
  },
  // Ensure preview also uses a unique, consistent port
  preview: {
    port: 4181,
    strictPort: true,
    open: true,
  },
  build: {
    // Optimize for mobile performance
    target: 'es2015', // Broader compatibility
    cssCodeSplit: true, // Split CSS for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate vendor chunks for better caching
          react: ['react', 'react-dom'],
        }
      }
    },
    // Optimize chunk size
    chunkSizeWarningLimit: 1000,
  },
  // CSS optimizations
  css: {
    devSourcemap: false, // Disable in production for performance
  }
})
