import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

/**
 * PET web app — separate React SPA build (Purvanchal Education Trust
 * organization & field operations). Output is served by the Express
 * server itself at /app (same-origin → no CORS surface for /api).
 */
export default defineConfig(() => {
  return {
    root: 'pet-web',
    base: '/app/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@pet': path.resolve(__dirname, 'pet-web/src'),
        '@shared': path.resolve(__dirname, 'src'),
      },
    },
    build: {
      outDir: path.resolve(__dirname, 'server/public/app'),
      emptyOutDir: true,
      target: 'es2020',
    },
    server: {
      // Allow the sandboxed live-preview host (*.e2b.app) in dev.
      allowedHosts: ['.e2b.app'],
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        // Dev-only: forward the operational API to the local Express server.
        '/api': {
          target: process.env.PET_API_DEV_TARGET || 'http://localhost:8080',
          changeOrigin: false,
        },
      },
    },
  };
});
