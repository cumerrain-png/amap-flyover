import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(__dirname),
  plugins: [react()],
  publicDir: resolve(__dirname, '../public'),
  resolve: {
    alias: {
      '@': resolve(__dirname),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: resolve(__dirname, '../dist'),
    emptyOutDir: true,
  },
});
