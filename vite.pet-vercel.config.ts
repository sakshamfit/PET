import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { makeBuildStamp } from './scripts/vite-build-stamp.mjs';

/**
 * PET field-operations app — **static preview** build (Vercel / any static host).
 *
 * WHY THIS EXISTS
 * ---------------
 * The real PET deployment is the office server: `npm run build:pet` writes the
 * SPA into `server/public/app`, and Express serves it same-origin next to the
 * API at `/api/*` (docs/PET/13_OFFICE_PC_CLOUDFLARE_TUNNEL_GOLIVE.md). Vercel
 * cannot run that server — Express + SQLite (better-sqlite3) + on-disk uploads
 * have no place in a serverless static host.
 *
 * That is exactly why "Vercel still shows the old build" kept being true: every
 * Vercel project on this repository ran `npm run build:legacy`, so the deployed
 * artefact was *always* the legacy M.S. Public School portal (`src/`) and never
 * contained a single line of the new PET app (`pet-web/`), no matter how many
 * times the PET app was changed.
 *
 * So one Vercel deployment now carries both apps:
 *
 *   /       → legacy M.S. Public School portal   (dist/,  unchanged)
 *   /app/   → PET field-operations app           (dist/app, this config)
 *
 * The preview build is stamped like every other PET build and is honest about
 * what it is: it sets `__PET_STATIC_PREVIEW__`, so the UI says "static preview —
 * no data server on this host" instead of silently failing to sign in. Set
 * `PET_API_BASE` (e.g. https://app.purvanchaltrust.org) at build time and the
 * preview talks to the real PET server instead.
 */
export default defineConfig(({ command }) => {
  const { build, plugin: buildStamp } = makeBuildStamp({
    app: 'pet',
    root: __dirname,
    version: process.env.APP_VERSION || '1.0.0',
    devMode: command !== 'build',
  });

  const apiBase = (process.env.PET_API_BASE || '').replace(/\/+$/, '');

  /**
   * Lets a static deployment point at a real PET server. `petApi.ts` already
   * honours `window.PET_API_BASE`; this injects it before the bundle runs.
   */
  function apiBasePlugin(): Plugin {
    return {
      name: 'inject-pet-api-base',
      apply: 'build',
      transformIndexHtml(html) {
        if (!apiBase) return html;
        return html.replace(
          '</head>',
          `  <script>window.PET_API_BASE=${JSON.stringify(apiBase)}</script>\n  </head>`
        );
      },
    };
  }

  return {
    root: 'pet-web',
    base: '/app/',
    plugins: [react(), tailwindcss(), buildStamp, apiBasePlugin()],
    define: {
      __PET_BUILD__: JSON.stringify(build),
      // True ⇒ this bundle has no API next to it; the UI says so out loud.
      __PET_STATIC_PREVIEW__: JSON.stringify(true),
    },
    resolve: {
      alias: {
        '@pet': path.resolve(__dirname, 'pet-web/src'),
        '@shared': path.resolve(__dirname, 'src'),
      },
    },
    build: {
      // Nested *inside* the legacy build's output, so both apps ship as one
      // Vercel deployment. Never empty it — dist/ belongs to vite.config.ts.
      outDir: path.resolve(__dirname, 'dist/app'),
      emptyOutDir: false,
      target: 'es2020',
    },
  };
});
