/**
 * Vite plugin: stamp a web build with its identity.
 *
 * Every PET/admin build gets a build id derived from the git commit plus a
 * fingerprint of the sources it was compiled from, which is then:
 *   • injected into the bundle as `__PET_BUILD__` / `__ADMIN_BUILD__`
 *     (shown in the UI, and used to detect a newer build on the server);
 *   • written next to the bundle as `build-info.json` (read by /health,
 *     check:build and verify:live);
 *   • embedded in the HTML shell as a `<meta>` tag, so even a plain
 *     `curl https://app.example.org/app/` shows which build is live.
 *
 * Shared by vite.pet.config.ts and vite.admin.config.ts.
 */

import { createBuildInfo } from '../server/src/lib/source-hash.js';

/**
 * @param {{ app: string, root: string, version: string, devMode?: boolean,
 *           extra?: Record<string, unknown> }} opts
 *   `extra` adds facts about the *deployment* to the stamp — which host it is
 *   for, which API it talks to (`{ deployment: 'vercel-static', api: '…' }`).
 *   build-info.json is the artefact that answers "what is actually live?", and
 *   during the "Vercel shows the old app" incident the honest answer to "what
 *   is this deployment?" was not in it. Now it is.
 * @returns {{ build: import('../server/src/lib/source-hash.js').BuildInfo, plugin: import('vite').Plugin }}
 */
export function makeBuildStamp({ app, root, version, devMode = false, extra = {} }) {
  const real = { ...createBuildInfo({ root, app, version }), ...extra };

  // In dev the app is rebuilt by Vite on every keystroke; a stamped id would
  // be noise, and the client-side "newer build" watcher must stay quiet.
  const build = devMode ? { ...real, buildId: 'dev', builtAt: new Date().toISOString() } : real;

  const plugin = {
    name: `${app}-build-stamp`,
    apply: 'build',
    transformIndexHtml() {
      return [
        { tag: 'meta', attrs: { name: `${app}-build`, content: build.buildId }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: `${app}-build-time`, content: build.builtAt }, injectTo: 'head' },
      ];
    },
    generateBundle() {
      // Emitted as a build asset so it is always written together with — and
      // only with — the JS/CSS it describes.
      this.emitFile({
        type: 'asset',
        fileName: 'build-info.json',
        source: JSON.stringify(build, null, 2),
      });
      console.log(
        `\n  ${app} build  ${build.buildId}  (commit ${build.commit ?? 'unknown'}, ${build.sourceFiles ?? 0} source files)\n`
      );
    },
  };

  return { build, plugin };
}
