import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App';
import { EntitlementProvider } from './billing/EntitlementProvider';
import { initNativeStorage } from './lib/platform';
import './index.css';

// Native: restore durable storage before the first render reads it.
void initNativeStorage().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <EntitlementProvider>
        <App />
      </EntitlementProvider>
    </StrictMode>,
  );
  if (Capacitor.isNativePlatform()) {
    void import('@capacitor/splash-screen').then(({ SplashScreen }) => SplashScreen.hide());
  }
});

// The native app ships its files locally, a service worker is only for web/PWA.
if ('serviceWorker' in navigator && import.meta.env.PROD && !Capacitor.isNativePlatform()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service Worker nicht registriert', err));
  });
}
