import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyRuntimeApiBase } from './runtime';
import './index.css';

// Which PET server this copy talks to must be settled *before* the first
// render: the login screen fires an auth request the moment it is submitted,
// and a half-applied base URL is how you get a network error nobody can
// explain. Device choice first, build-time PET_API_BASE second.
applyRuntimeApiBase();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
