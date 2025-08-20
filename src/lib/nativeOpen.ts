import { AppLauncher } from '@capacitor/app-launcher';

export async function openExternalUrl(url: string) {
  try {
    // Try AppLauncher (best for custom schemes like upi://, tel:, whatsapp:)
    const can = await AppLauncher.canOpenUrl({ url });
    if (can.value) {
      await AppLauncher.openUrl({ url });
      return;
    }
  } catch (_) {}
  // Fallback: let the WebView/browser try
  try {
    window.location.href = url;
  } catch (e) {
    alert('No compatible app found to open this link.');
  }
}