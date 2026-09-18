import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // Electron loads the packaged renderer through file://, where absolute Vite
  // asset URLs resolve to file:///assets instead of this bundle's assets folder.
  // This must stay './' — main/window-manager.ts loads ../../renderer/index.html.
  base: './',
  plugins: [vue(), tailwindcss()],
  build: {
    // Keep the same output shape as the React renderer so the Electron main
    // process (which resolves ../../renderer/index.html) needs no changes.
    outDir: 'dist',
    emptyOutDir: true,
  },
})
