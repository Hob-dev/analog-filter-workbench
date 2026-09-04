import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// A browser-only calculator has no Worker bindings or server runtime.
export default defineConfig({
  css: { postcss: { plugins: [tailwindcss()] } },
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  plugins: [react(), sites()],
  build: { outDir: 'out' },
  server: { port: 3000, strictPort: true },
});
