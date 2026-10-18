import { test, expect, mock } from 'bun:test';
mock.module('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
const { resolveAssetUrl } = await import('../src/lib/assetUrl');

test('native app loads hosted photos from the live site', () => {
  expect(resolveAssetUrl('/__l5e/assets-v1/x/a.png', true)).toBe('https://app.didisnow.com/__l5e/assets-v1/x/a.png');
});
test('web keeps relative hosted photo paths', () => {
  expect(resolveAssetUrl('/__l5e/assets-v1/x/a.png', false)).toBe('/__l5e/assets-v1/x/a.png');
});
test('bundled images are untouched in the native app', () => {
  expect(resolveAssetUrl('/assets/banner-maid-1.webp', true)).toBe('/assets/banner-maid-1.webp');
});
