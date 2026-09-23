import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// Frontend-only config: builds pet-web/src into dist/
const RAW_API_BASE = (process.env.PET_API_BASE || '').trim();

export default defineConfig({
  root: 'pet-web',
  base: '/',
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'pet-build-info',
      apply: 'build',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'build-info.json',
          source: JSON.stringify(
            {
              app: 'pet-frontend',
              version: '1.0.0',
              build_id: `${Date.now()}`,
              built_at: new Date().toISOString(),
              api: RAW_API_BASE || 'not-configured',
            },
            null,
            2
          ),
        });
      },
    },
  ],
  define: {
    __PET_BUILD__: JSON.stringify({ id: `${Date.now()}`, version: '1.0.0' }),
    __PET_STATIC_PREVIEW__: JSON.stringify(!RAW_API_BASE),
    __PET_BUILD_INFO_URL__: JSON.stringify('/build-info.json'),
    __PET_HOSTED_STATIC__: JSON.stringify(true),
  },
  resolve: {
    alias: {
      '@pet': path.resolve(__dirname, 'pet-web/src'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'es2020',
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: process.env.PET_API_DEV_TARGET || 'http://localhost:8080',
        changeOrigin: false,
      },
    },
  },
});
