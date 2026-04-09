/**
 * Debug-gated logger.
 * In production builds, info/warn logs are suppressed unless
 * localStorage.DEBUG === 'true' or URL has ?debug=1.
 */

const isDebug = (() => {
  try {
    if (typeof window === 'undefined') return false;
    if (new URLSearchParams(window.location.search).get('debug') === '1') return true;
    return localStorage.getItem('DEBUG') === 'true';
  } catch {
    return false;
  }
})();

export const log = {
  /** Always shown */
  error: console.error.bind(console),
  /** Shown only when DEBUG is enabled */
  info: isDebug ? console.info.bind(console) : () => {},
  /** Shown only when DEBUG is enabled */
  warn: isDebug ? console.warn.bind(console) : () => {},
};
