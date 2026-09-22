import type { CapacitorConfig } from '@capacitor/cli';

/**
 * PET Ops — the field-operations Android shell (not the legacy school app).
 *
 * The legacy wrapper stays in `android/` + `capacitor.config.ts`
 * (`com.sakshamfit.schoolmanagement`, "School Management"). This file is what
 * `npm run android:pet:init|sync|apk` loads (the CLI only reads
 * capacitor.config.ts, so the script swaps this file in for that call and
 * puts the legacy config back).
 *
 * `android.path` is `android-pet` on purpose. Do not point these commands at
 * `android/` — that project is a different application id.
 *
 * The APK opens the live office server (Cloudflare Tunnel) rather than a
 * frozen copy of the SPA. Employees then get the same build the browser gets,
 * including the "Update now" banner. Override the address at sync/apk time:
 *
 *   PET_ANDROID_SERVER_URL=https://app.plusoneco.in/app/ npm run android:pet:sync
 *
 * Set PET_ANDROID_SERVER_URL empty only if you intend to ship the bundled
 * assets instead (they are the office-server build, base `/app/`, and will not
 * resolve inside a WebView — do not do that without a dedicated base).
 */
const serverUrl = (process.env.PET_ANDROID_SERVER_URL ?? 'https://app.plusoneco.in/app/').trim();

const config: CapacitorConfig = {
  appId: 'in.plusoneco.pet',
  appName: 'PET Ops',
  webDir: 'server/public/app',
  android: {
    path: 'android-pet',
    allowMixedContent: false,
  },
  server: serverUrl
    ? {
        url: serverUrl,
        cleartext: serverUrl.startsWith('http://'),
        androidScheme: 'https',
        allowNavigation: ['app.plusoneco.in', '*.plusoneco.in'],
      }
    : {
        androidScheme: 'https',
        cleartext: false,
      },
};

export default config;
