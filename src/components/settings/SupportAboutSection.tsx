/**
 * Settings → About → Support
 *
 * Shows diagnostic information for customer support. Deliberately EXCLUDES
 * everything sensitive: no tokens, no passwords, no encryption keys, no
 * Google credentials, no server secrets — only what support staff needs
 * to identify an installation.
 */

import React, { useEffect, useState } from 'react';
import { LifeBuoy, RefreshCw, Copy, Check, Rocket } from 'lucide-react';
import {
  isDesktop,
  getControlPlane,
  SupportInfo,
  UpdateCheckResult,
} from '../../services/controlPlane';
import { BUILD } from '../../build';

export const SupportAboutSection: React.FC = () => {
  const desktop = isDesktop();
  const [info, setInfo] = useState<SupportInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [update, setUpdate] = useState<UpdateCheckResult | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!desktop) return;
    getControlPlane()
      ?.getSupportInfo()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [desktop]);

  const copyAll = async () => {
    if (!info) return;
    const text = [
      `School Management System — Support Diagnostics`,
      `App Version: ${info.appVersion}`,
      `Web Build: ${BUILD.buildId} (${BUILD.version}, commit ${BUILD.commit || 'unknown'})`,
      `School: ${info.schoolName || '—'} (${info.schoolId || '—'})`,
      `License: ${info.licenseStatus}${info.licenseExpiresAt ? ` (until ${info.licenseExpiresAt})` : ''}`,
      `Device: ${info.deviceName} [${info.deviceReference}]`,
      `Platform: ${info.platform}`,
      `Server: ${info.serverHost}`,
      `Last verified: ${info.lastValidatedAt || '—'}`,
      `Diagnostics ID: ${info.diagnosticsId}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  const checkUpdates = async () => {
    const cp = getControlPlane();
    if (!cp) return;
    setChecking(true);
    try {
      setUpdate(await cp.checkForUpdates());
    } finally {
      setChecking(false);
    }
  };

  return (
    <section className="mt-8 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-4">
        <LifeBuoy className="h-5 w-5 text-gray-500" />
        <h2 className="text-lg font-semibold text-gray-900">About &amp; Support</h2>
      </div>

      {!desktop ? (
        <div className="text-sm text-gray-600 space-y-2">
          <p>
            <span className="font-medium">M.S. PUBLIC SCHOOL — Management System</span> (web version)
          </p>
          <p>
            The commercial desktop application shows licensing, device and diagnostics information
            here. For support, contact your software provider.
          </p>
          <p className="font-mono text-[11px] text-gray-400" title={`Commit ${BUILD.commit || 'unknown'} · built ${BUILD.builtAt}`}>
            Web build {BUILD.buildId} · v{BUILD.version}
          </p>
        </div>
      ) : !info ? (
        <p className="text-sm text-gray-400">Loading diagnostics…</p>
      ) : (
        <div className="space-y-4">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div className="flex justify-between sm:block">
              <dt className="text-gray-500">Application Version</dt>
              <dd className="font-mono font-medium">{info.appVersion}</dd>
            </div>
            <div className="flex justify-between sm:block">
              <dt className="text-gray-500">Web Build</dt>
              <dd className="font-mono font-medium" title={`Commit ${BUILD.commit || 'unknown'} · built ${BUILD.builtAt}`}>{BUILD.buildId}</dd>
            </div>
            <div className="flex justify-between sm:block">
              <dt className="text-gray-500">School ID</dt>
              <dd className="font-mono font-medium">{info.schoolId || '—'}</dd>
            </div>
            <div className="flex justify-between sm:block">
              <dt className="text-gray-500">License Status</dt>
              <dd className="font-medium">{info.licenseStatus}</dd>
            </div>
            <div className="flex justify-between sm:block">
              <dt className="text-gray-500">Device Reference</dt>
              <dd className="font-mono font-medium">{info.deviceReference}</dd>
            </div>
            <div className="flex justify-between sm:block">
              <dt className="text-gray-500">Support Contact</dt>
              <dd className="font-medium">Your software provider (quote Diagnostics ID)</dd>
            </div>
            <div className="flex justify-between sm:block">
              <dt className="text-gray-500">Diagnostics ID</dt>
              <dd className="font-mono font-medium">{info.diagnosticsId}</dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={copyAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy diagnostics for support'}
            </button>
            <button
              type="button"
              onClick={checkUpdates}
              disabled={checking}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
            >
              {checking ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
              Check for updates
            </button>
          </div>

          {update && (
            <p
              className={`text-xs rounded-lg px-3 py-2 border ${
                update.ok
                  ? update.update_available
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}
            >
              {update.ok
                ? update.update_available
                  ? `Update available: v${update.release?.version}${update.mandatory_update ? ' (mandatory)' : ''} — the update installs with a safety backup of your data first.`
                  : 'You are on the latest version.'
                : `Update check failed: ${update.message || 'service unavailable'}`}
            </p>
          )}

          <p className="text-[11px] text-gray-400 leading-relaxed">
            Diagnostics never include passwords, authentication tokens, encryption keys or any
            cloud credentials.
          </p>
        </div>
      )}
    </section>
  );
};

export default SupportAboutSection;
