import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { makeBuildStamp } from './scripts/vite-build-stamp.mjs';
import { normalizeApiBase } from './src/services/petApiBase';

/**
 * PET field-operations app — the build that Vercel deploys, at the ROOT.
 *
 * WHY THIS FILE EXISTS (read this before changing vercel.json)
 * -----------------------------------------------------------
 * The real PET server is the office PC: `npm run build:pet` writes the SPA into
 * `server/public/app`, and Express serves it same-origin next to the API at
 * `/api/*` (docs/PET/13_OFFICE_PC_CLOUDFLARE_TUNNEL_GOLIVE.md). Vercel cannot
 * run that server — Express + SQLite (better-sqlite3) + on-disk uploads have no
 * place in a serverless static host.
 *
 * That is how "Vercel still shows the old build" stayed true for so long: every
 * Vercel project on this repository ran the *legacy* build, so the deployed
 * artefact was always the M.S. Public School portal (`src/`) and never
 * contained a single line of `pet-web/`. The deployment was current; the app on
 * it was the wrong app.
 *
 * So Vercel now deploys exactly one thing — this app:
 *
 *   /            → PET field-operations app   (dist/, this config)
 *   /build-info.json → {"app":"pet", …}       ← proves which app is live
 *
 * TALKING TO THE REAL SERVER
 * --------------------------
 * Two ways to point this build at the PET server, in order of preference:
 *
 *   1. `PET_API_BASE` at build time (Vercel → project → Settings →
 *      Environment Variables, e.g. https://app.purvanchaltrust.org) and
 *      redeploy. Baked into the bundle; staff do nothing.
 *   2. The in-app "connect to server" screen (pet-web/src/connect.tsx), which
 *      stores a server address in the browser. Same mechanism, no redeploy.
 *
 * With neither, the build is an honest interface preview: it says so on screen
 * and cannot sign anyone in (`__PET_STATIC_PREVIEW__`).
 *
 * WHATEVER URL YOU SERVE THIS FROM, THE SERVER MUST ALLOW IT: the office PC
 * needs `CORS_ORIGINS=https://your-deployment.vercel.app` (exact origins, no
 * wildcards — see server/src/app.js). `npm run verify:deploy --url <url>`
 * checks both ends of that wiring.
 */

const RAW_API_BASE = (process.env.PET_API_BASE || '').trim();

/**
 * A bad PET_API_BASE must stop the build, not ship a bundle whose every request
 * goes to the wrong host. On Vercel (`VERCEL=1`) a localhost/private address is
 * always a mistake; locally it is how you point the static build at a dev
 * server on your own machine.
 */
const parsedApiBase = RAW_API_BASE
  ? normalizeApiBase(RAW_API_BASE, { allowLocal: process.env.VERCEL !== '1' })
  : null;

if (parsedApiBase && !parsedApiBase.ok) {
  throw new Error(
    `PET_API_BASE is not usable: ${parsedApiBase.error}\n` +
      `   got: ${JSON.stringify(RAW_API_BASE)}\n` +
      '   Fix it in Vercel → project → Settings → Environment Variables, then redeploy.\n' +
      '   Leave it unset to build the interface-only preview instead.\n'
  );
}
if (parsedApiBase?.ok && parsedApiBase.warning) {
  console.warn(`\n⚠️  PET_API_BASE: ${parsedApiBase.warning}\n`);
}

/** e.g. https://app.example.org/api — '' means "no server configured". */
const API_BASE = (parsedApiBase?.ok ? parsedApiBase.base : '') ?? '';

export default defineConfig(({ command }) => {
  const { build, plugin: buildStamp } = makeBuildStamp({
    app: 'pet',
    root: __dirname,
    version: process.env.APP_VERSION || '1.0.0',
    devMode: command !== 'build',
    extra: {
      deployment: 'vercel-static',
      // Answers "is this copy of PET wired to a server?" from one curl.
      api: API_BASE || 'none (interface preview)',
    },
  });

  /**
   * Runtime configuration for a static host: which server this app talks to.
   *
   * Emitted as a JSON data block (not an executable inline script) so the
   * Content-Security-Policy below can stay at `script-src 'self'` — an inline
   * `<script>` would force `'unsafe-inline'` and give up XSS protection
   * entirely. `pet-web/src/runtime.ts` reads it at boot, before React renders,
   * so no API call can ever race the configuration.
   */
  function runtimeConfigPlugin(): Plugin {
    return {
      name: 'pet-runtime-config',
      apply: 'build',
      transformIndexHtml(html) {
        const config = JSON.stringify({ apiBase: API_BASE }).replace(/</g, '\\u003c');
        return html.replace(
          '</head>',
          `  <script type="application/json" id="pet-runtime-config">${config}</script>\n  </head>`
        );
      },
    };
  }

  /**
   * Content-Security-Policy for the deployed app.
   *
   * `connect-src` must allow https: because the API host is configurable (the
   * Cloudflare Tunnel domain). `style-src 'unsafe-inline'` is required by React
   * style attributes. Deliberately NO `frame-ancestors`: the app has to stay
   * embeddable for the sandboxed live preview used during development.
   */
  function cspPlugin(): Plugin {
    const CSP = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https: wss:",
      "base-uri 'self'",
      "object-src 'none'",
      "form-action 'self'",
    ].join('; ');
    return {
      name: 'inject-pet-csp',
      apply: 'build',
      transformIndexHtml(html) {
        return html.replace(
          '<head>',
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`
        );
      },
    };
  }

  /**
   * The PWA manifest is written for the office-server layout (`/app/`). This
   * deployment serves the app from the root, so the manifest is re-based to
   * match where the browser actually is — otherwise "Add to Home Screen" would
   * install a shortcut to a path that does not exist here.
   */
  function manifestBasePlugin(): Plugin {
    const source = path.resolve(__dirname, 'pet-web/public/manifest.webmanifest');
    const emitDir = path.resolve(__dirname, 'dist');
    return {
      name: 'pet-manifest-base',
      apply: 'build',
      // writeBundle, not generateBundle: files from `public/` are copied into
      // the output directory *after* the bundle is generated, so patching the
      // asset earlier silently does nothing.
      writeBundle() {
        const target = path.join(emitDir, 'manifest.webmanifest');
        if (!fs.existsSync(target)) return;
        const manifest = JSON.parse(fs.readFileSync(source, 'utf8'));
        manifest.id = '/';
        manifest.start_url = '/';
        manifest.scope = '/';
        manifest.icons = (manifest.icons || []).map(icon => ({ ...icon, src: '/pet-icon.svg' }));
        fs.writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);
        console.log('  pet manifest rebased to / for this deployment');
      },
    };
  }

  return {
    root: 'pet-web',
    // Served from the root of the deployment — set by vercel.json
    // (outputDirectory: "dist").
    base: '/',
    plugins: [
      react(),
      tailwindcss(),
      cspPlugin(),
      runtimeConfigPlugin(),
      manifestBasePlugin(),
      buildStamp,
    ],
    define: {
      __PET_BUILD__: JSON.stringify(build),
      // True ⇒ this build has no PET server to talk to at all; the UI says so
      // out loud and offers the connect screen instead of failing silently.
      // False as soon as PET_API_BASE is configured.
      __PET_STATIC_PREVIEW__: JSON.stringify(!API_BASE),
      // This deployment is rooted at '/' (see base above).
      __PET_BUILD_INFO_URL__: JSON.stringify('/build-info.json'),
      // True ⇒ this bundle is served by a static host, so "which server?" is a
      // question with an answer that can change without a rebuild.
      __PET_HOSTED_STATIC__: JSON.stringify(true),
    },
    resolve: {
      alias: {
        '@pet': path.resolve(__dirname, 'pet-web/src'),
        '@shared': path.resolve(__dirname, 'src'),
      },
    },
    build: {
      // The deployment root (vercel.json → outputDirectory). This artefact is
      // ONLY for the static host: the office server ships the build from
      // vite.pet.config.ts (→ server/public/app) and Electron packages
      // `npm run build:legacy`. Never point those at this directory.
      outDir: path.resolve(__dirname, 'dist'),
      emptyOutDir: true,
      target: 'es2020',
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
      strictPort: true,
      // The sandboxed live preview reaches the dev/preview server through a
      // *.e2b.app host; Vite rejects unknown Host headers with 403.
      allowedHosts: ['.e2b.app'],
    },
  };
});
