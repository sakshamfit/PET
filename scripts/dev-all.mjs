#!/usr/bin/env node
/**
 * dev:all — run the PET API (Express, :8080) and the PET web app (Vite, :3000)
 * together with prefixed logs. Ctrl+C stops both.
 *
 *   npm run dev:all
 *
 * The browser only ever talks to :3000; Vite proxies /api → :8080 (see
 * vite.pet.config.ts), so there is no CORS surface in development either.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const children = [];
let shuttingDown = false;

function run(name, color, args) {
  const child = spawn(npm, args, {
    cwd: ROOT,
    env: process.env,
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = stream => {
    let buf = '';
    stream.on('data', chunk => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) console.log(tag + line);
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);
  child.on('exit', code => {
    if (!shuttingDown) {
      console.log(`${tag}exited with code ${code} — stopping the other process`);
      shutdown(code ?? 0);
    }
  });
  children.push(child);
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try {
      c.kill();
    } catch {
      /* already gone */
    }
  }
  setTimeout(() => process.exit(code), 300);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('');
console.log('PET development');
console.log('  API      → http://localhost:8080   (health: /health)');
console.log('  Web app  → http://localhost:3000/app/');
console.log('');
console.log('The app talks to /api through the Vite proxy — no CORS, same paths as production.');
console.log('');

run('api', '36', ['run', 'server:dev']);
run('web', '32', ['run', 'dev:pet']);
