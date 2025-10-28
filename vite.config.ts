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
})
