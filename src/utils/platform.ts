import { Capacitor } from '@capacitor/core';

export type AppPlatform = 'web' | 'android' | 'ios';

export function getAppPlatform(): AppPlatform {
  const platform = Capacitor.getPlatform();
  if (platform === 'android') return 'android';
  if (platform === 'ios') return 'ios';
  return 'web';
}

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}
