/** Presentation-only defense. System-delivered push content still requires a safe server payload. */
export function safeNotificationText(text?: string): string | undefined {
  return text?.replace(/\b((?:booking\s+)?(?:start\s+|completion\s+|check[- ]in\s+)?(?:OTP|code))\s*[:#-]?\s*\d{3,6}\b/gi, '$1: [hidden]');
}