import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { makeBuildStamp } from './scripts/vite-build-stamp.mjs';

/**
 * Admin Control Panel — separate React SPA build.
 *
 * Output is served by the control-plane server itself at /admin
 * (same-origin → no CORS surface for the admin API).
 *
 * Stamped like the PET app so a stale admin bundle is detected the same way
 * (check:build / verify:live / /health).
 */
export default defineConfig(({ command }) => {
  const { build, plugin: buildStamp } = makeBuildStamp({
    app: 'admin',
    root: __dirname,
    version: process.env.APP_VERSION || '1.0.0',
    devMode: command !== 'build',
  });

  return {
    root: 'admin',
    base: '/admin/',
    plugins: [react(), tailwindcss(), buildStamp],
    define: {
      __ADMIN_BUILD__: JSON.stringify(build),
    },
    resolve: {
      alias: {
        '@admin': path.resolve(__dirname, 'admin/src'),
      },
    },
    build: {
      outDir: path.resolve(__dirname, 'server/public/admin'),
      emptyOutDir: true,
      target: 'es2020',
    },
    server: {
      // Allow the sandboxed live-preview host (*.e2b.app) in dev.
      allowedHosts: ['.e2b.app'],
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        // Dev-only: forward the admin API to the local control-plane server.
        '/admin/api': {
          target: 'http://localhost:8080',
          changeOrigin: false,
        },
      },
    },
  };
});
