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
      // Do not wait for plugin splash; rely on OS launch screen
      launchShowDuration: 0,
      // keep these for manual uses later inside the app if you ever call SplashScreen.show()
      backgroundColor: '#ff007a',
      showSpinner: false,
    }
  }
};

export default config;