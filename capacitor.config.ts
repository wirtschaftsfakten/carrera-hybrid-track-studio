import type { CapacitorConfig } from '@capacitor/cli';

// appId must match the bundle id registered in App Store Connect and
// APPLE_BUNDLE_ID on the server. Change before the first TestFlight upload.
const config: CapacitorConfig = {
  appId: 'app.trackstudio.hybrid',
  appName: 'Track Studio',
  webDir: 'dist',
  backgroundColor: '#07080b',
  ios: {
    contentInset: 'never',
    backgroundColor: '#07080b',
    scheme: 'Track Studio',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#07080b',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      overlaysWebView: true,
    },
  },
};

export default config;
