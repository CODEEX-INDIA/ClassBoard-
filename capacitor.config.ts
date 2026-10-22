import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.classboard.app',
  appName: 'ClassBoard',
  webDir: 'out',
  server: {
    // For live-reload during dev: uncomment and set your LAN IP
    // url: 'http://192.168.1.100:3000',
    // cleartext: true,
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#0a1120',
    // Landscape by default for classroom boards; user can rotate if needed.
    // Enforced in AndroidManifest.xml as well.
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#0a1120',
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: false,
      backgroundColor: '#0a1120',
    },
  },
};

export default config;
