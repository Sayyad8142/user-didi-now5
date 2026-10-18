import { Capacitor } from '@capacitor/core';

// Lovable-hosted assets use root-relative URLs ("/__l5e/..."). Inside the
// Android/iOS app the page origin is the local WebView, which does not serve
// them, so native builds must load them from the published web origin.
export const ASSET_ORIGIN = 'https://app.didisnow.com';

export function resolveAssetUrl(url: string, isNative = Capacitor.isNativePlatform()): string {
  if (isNative && url.startsWith('/__l5e/')) return `${ASSET_ORIGIN}${url}`;
  return url;
}
