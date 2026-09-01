import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // Electron loads the packaged renderer through file://, where absolute Vite
  // asset URLs resolve to file:///assets instead of this bundle's assets folder.
  base: './',
  plugins: [react(), tailwindcss()],
})
