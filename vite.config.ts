import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

/**
 * PET Frontend — Vite config (frontend-only build)
 *
 * WHAT THIS DOES:
 * - Builds the React SPA in pet-web/src into dist/
 * - Serves it at / (root) for Vercel/static hosting
 * - Proxies /api to local backend during dev (if you run backend on :8080)
 *
 * WHY 2 CONFIGS EXISTED BEFORE:
 * - vite.pet.config.ts → office PC build (Express serves SPA at /app/)
 * - vite.pet-vercel.config.ts → Vercel build (SPA at /)
 * Now we have ONE simple config for frontend-only development.
 *
 * HOW API BASE WORKS:
 * - Dev: uses window.PET_API_BASE or /api proxy
 * - Prod (Vercel): set PET_API_BASE env var to your backend URL (e.g. https://app.plusoneco.in)
 * - If no API configured, UI shows "connect to server" screen (interface preview)
 */

const RAW_API_BASE = (process.env.PET_API_BASE || '').trim();

export default defineConfig(({ command }) => {
  const isDev = command !== 'build';

  return {
    // Root is pet-web folder — contains index.html
    root: 'pet-web',
    base: '/',
    plugins: [
      react(),
      tailwindcss(),
      // Simple build info injection (replaces complex server-dependent stamp)
      {
        name: 'pet-build-info',
        apply: 'build',
        generateBundle() {
          // Write build-info.json for health checks
          this.emitFile({
            type: 'asset',
            fileName: 'build-info.json',
            source: JSON.stringify(
              {
                app: 'pet-frontend',
                version: '1.0.0',
                build_id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                built_at: new Date().toISOString(),
                api: RAW_API_BASE || 'not-configured',
                deployment: 'frontend-only',
              },
              null,
              2
            ),
          });
        },
      },
    ],
    define: {
      // Build-time flags used by pet-web/src/build.tsx and runtime.ts
      __PET_BUILD__: JSON.stringify({
        id: `${Date.now()}`,
        version: '1.0.0',
        built_at: new Date().toISOString(),
      }),
      __PET_STATIC_PREVIEW__: JSON.stringify(!RAW_API_BASE),
      __PET_BUILD_INFO_URL__: JSON.stringify('/build-info.json'),
      __PET_HOSTED_STATIC__: JSON.stringify(true),
    },
    resolve: {
      alias: {
        // Allow imports like '@pet/pages/Login' and '@shared/services/petApi'
        '@pet': path.resolve(__dirname, 'pet-web/src'),
        '@shared': path.resolve(__dirname, 'src'),
      },
    },
    build: {
      outDir: path.resolve(__dirname, 'dist'),
      emptyOutDir: true,
      target: 'es2020',
      // Simple chunk splitting for better caching
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
          },
        },
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      // Allow preview hosts (for cloud IDEs)
      allowedHosts: ['.e2b.app'],
      proxy: {
        // During dev, forward /api to local backend if running
        // Example: PET_API_DEV_TARGET=http://localhost:8080 npm run dev
        '/api': {
          target: process.env.PET_API_DEV_TARGET || 'http://localhost:8080',
          changeOrigin: false,
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
    },
  };
});
