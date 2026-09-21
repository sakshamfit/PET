/**
 * Control-plane server entrypoint.
 *
 * - Development: plain HTTP on HOST:PORT (desktop dev machines only).
 * - Production : HTTPS via TLS_CERT_FILE/TLS_KEY_FILE, or HTTP behind a
 *   TLS-terminating reverse proxy (TRUST_PROXY=1). Insecure production
 *   configuration is rejected at config load time — see config.js.
 */

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import config from './config.js';
import { initDb } from './db.js';
import { initPetDb } from './pet/db.js';
import { createApp } from './app.js';

function main() {
  initDb();
  initPetDb();
  // PET upload tree (students/schools/field-visits/documents) + backups.
  for (const sub of ['students', 'schools', 'field-visits', 'documents']) {
    fs.mkdirSync(`${config.pet.uploadDir}/${sub}`, { recursive: true });
  }
  fs.mkdirSync(config.pet.backupDir, { recursive: true });

  if (config._devSecretWarning) {
    console.warn(
      '⚠️  LICENSE_TOKEN_SECRET is not set — using an INSECURE development default. Set it via environment before any real use.'
    );
  }

  const app = createApp();

  let server;
  if (config.isProduction && config.tls.certFile && config.tls.keyFile) {
    server = https.createServer(
      {
        cert: fs.readFileSync(config.tls.certFile),
        key: fs.readFileSync(config.tls.keyFile),
        minVersion: 'TLSv1.2',
      },
      app
    );
  } else {
    server = http.createServer(app);
    if (config.isProduction) {
      console.log('ℹ️  TRUST_PROXY enabled: expecting TLS termination at the reverse proxy.');
    }
  }

  server.listen(config.server.port, config.server.host, () => {
    const scheme = server instanceof https.Server ? 'https' : 'http';
    console.log('');
    console.log('🏫 School Management System — Production Control Plane');
    console.log(`   mode:     ${config.nodeEnv}`);
    console.log(`   listening ${scheme}://${config.server.host}:${config.server.port}`);
    console.log(`   health:   ${scheme}://localhost:${config.server.port}/health`);
    console.log(`   admin:    ${scheme}://localhost:${config.server.port}/admin`);
    console.log('');
  });

  const shutdown = signal => {
    console.log(`\n[server] ${signal} received — shutting down gracefully…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 8000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
