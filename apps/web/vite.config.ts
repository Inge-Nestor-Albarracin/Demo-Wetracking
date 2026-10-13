import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Fixed port: the API only accepts this origin through CORS_ORIGIN.
  server: { port: 5173, strictPort: true },
})
