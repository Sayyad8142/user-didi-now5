import { AppLauncher } from '@capacitor/app-launcher';

export async function openExternalUrl(url: string) {
  // For UPI URLs, always use window.location.href to show app chooser on both platforms
  if (url.startsWith('upi://')) {
    try {
      window.location.href = url;
      return;
    } catch (e) {
      alert('No compatible UPI app found. Please install a UPI app like GPay, PhonePe, or Paytm.');
      return;
    }
  }

  // For other URLs, try AppLauncher first
  try {
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