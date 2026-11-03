import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { setStorageMirror } from './storage';

/**
 * iOS may clear WKWebView localStorage under storage pressure. In the native
 * app every write is mirrored to Capacitor Preferences (UserDefaults) and
 * restored into localStorage before the app renders. The web and the PWA
 * use localStorage directly.
 */
export async function initNativeStorage(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { keys } = await Preferences.keys();
    for (const key of keys.filter((k) => k.startsWith('chts.'))) {
      if (localStorage.getItem(key) !== null) continue;
      const { value } = await Preferences.get({ key });
      if (value !== null) localStorage.setItem(key, value);
    }
  } catch {
    // Preferences unavailable: fall back to plain localStorage
  }
  setStorageMirror((key, raw) => {
    if (raw === null) void Preferences.remove({ key });
    else void Preferences.set({ key, value: raw });
  });
}
