import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/maps/2026/regional-power-explorer/',
  plugins: [react()],
})
