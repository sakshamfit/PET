import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { makeBuildStamp } from './scripts/vite-build-stamp.mjs';

/**
 * PET web app — separate React SPA build (Purvanchal Education Trust
 * organization & field operations). Output is served by the Express
 * server itself at /app (same-origin → no CORS surface for /api).
 *
 * Every build is stamped (see scripts/vite-build-stamp.mjs). The bundle
 * carries its own build id, writes build-info.json beside itself, and the
 * server refuses to serve a bundle that does not match the checkout. That
 * trio is what makes "the software is still showing the old build" answerable
 * in one request (`npm run verify:live`) instead of guesswork.
 */
export default defineConfig(({ command }) => {
  const { build, plugin: buildStamp } = makeBuildStamp({
    app: 'pet',
    root: __dirname,
    version: process.env.APP_VERSION || '1.0.0',
    devMode: command !== 'build',
  });

  return {
    root: 'pet-web',
    base: '/app/',
    plugins: [react(), tailwindcss(), buildStamp],
    define: {
      __PET_BUILD__: JSON.stringify(build),
    },
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
