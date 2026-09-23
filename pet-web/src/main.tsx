/**
 * PET Frontend — Entry Point (main.tsx)
 * ======================================
 * This is the FIRST file that runs when the app loads.
 * 
 * BOOT ORDER IS CRITICAL:
 * 1. Read API base (where is backend?) BEFORE React renders
 * 2. Apply it to window.PET_API_BASE
 * 3. Then mount React
 * 
 * WHY THIS ORDER?
 * - Login screen fires auth request immediately on submit
 * - If API base is applied AFTER first render, you get network error
 * - Device choice (localStorage) must win over build-time config
 * 
 * API BASE PRECEDENCE (highest first):
 * 1. Device choice: localStorage 'pet.apiBase' (user picked in connect screen)
 * 2. Build-time: PET_API_BASE env var baked into bundle (Vercel)
 * 3. Nothing: same-origin /api (for office PC build) or preview mode
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyRuntimeApiBase } from './runtime';
import './index.css';

// STEP 1: Figure out which backend to talk to BEFORE React mounts
// This reads localStorage and the JSON block injected by vite.config.ts
// and sets window.PET_API_BASE so petApi.ts can use it on first request
applyRuntimeApiBase();

// STEP 2: Mount React
// StrictMode helps catch bugs in dev (double-invokes effects)
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
