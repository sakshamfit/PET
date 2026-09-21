import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

/**
 * Injects a Content-Security-Policy meta tag into the PRODUCTION build
 * only. The dev server stays permissive so HMR and the React preamble
 * keep working.
 *
 * Notes:
 *  - script-src 'self': the production bundle is fully self-contained.
 *  - style-src allows inline styles (React style attributes; Tailwind
 *    output is external CSS).
 *  - connect-src permits Firebase/Firestore, Firebase Auth, controlled
 *    https API endpoints, and (desktop) the licensing API host.
 */
function cspPlugin(): Plugin {
  const CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https: wss:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'inject-csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`
      );
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss(), cspPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Allow the sandboxed live-preview host (*.e2b.app) to load the dev server.
      // Vite rejects unknown Host headers with HTTP 403 by default.
      allowedHosts: ['.e2b.app'],
      // The PET operational API (Express) runs on :8080 in development;
      // the browser only ever speaks same-origin relative /api URLs.
      proxy: {
        '/api': {
          target: process.env.PET_API_DEV_TARGET || 'http://localhost:8080',
          changeOrigin: false,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
