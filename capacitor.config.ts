import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.didisnow.app',
  appName: 'Didi Now',
  webDir: 'dist',
  bundledWebRuntime: false,
  // Set Android WebView background color to match splash (prevents black flash)
  android: {
    backgroundColor: '#ec4899'
  },
  ios: {
    backgroundColor: '#ec4899'
  },
  server: {
    url: 'https://app.didisnow.com',
    cleartext: false,
    allowNavigation: [
      'app.didisnow.com',
      'didisnow.com',
      '*.supabase.co',
      '*.supabase.in',
      'cdn.jsdelivr.net',
      'fonts.gstatic.com',
      'fonts.googleapis.com'
    ]
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: false,
      showSpinner: false,
      backgroundColor: '#ec4899',
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  }
};

export default config;