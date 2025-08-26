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
      launchShowDuration: 1500,
      showSpinner: false,
      backgroundColor: '#ffffffff',
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true
    }
  }
};

export default config;