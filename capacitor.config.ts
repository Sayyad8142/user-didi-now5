import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.didisnow.app',
  appName: 'Didi Now',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    url: 'https://2edd991f-3825-445a-9485-006dde036295.lovableproject.com?forceHideBadge=true',
    cleartext: true,
    allowNavigation: ['*.lovable.app', '*.lovableproject.com', 'didisnow.com', '*.didisnow.com']
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