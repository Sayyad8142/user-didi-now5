import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.2edd991f3825445a9485006dde036295',
  appName: 'user-didi-now5',
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