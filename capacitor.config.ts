import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.didisnow.app',
  appName: 'Didi Now',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    url: 'https://user-didi-now5.lovable.app',
    cleartext: true,
    allowNavigation: ['*.lovable.app', 'didisnow.com', '*.didisnow.com']
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