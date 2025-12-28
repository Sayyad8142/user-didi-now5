import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.didisnow.app',
  appName: 'Didi Now',
  webDir: 'dist',
  bundledWebRuntime: false,
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
      launchShowDuration: 0,
      launchAutoHide: false,
      showSpinner: false,
      backgroundColor: '#ffffff',
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