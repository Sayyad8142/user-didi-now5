import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

const LS_KEY = 'didi_web_version';
const POLL_MS = 3 * 60 * 1000;
const isDev = import.meta.env.DEV;

function log(...args: unknown[]) {
  if (isDev) console.log('[WebVersion]', ...args);
}

type UpdateMode = 'soft' | 'block';

function normalizeMode(raw: string | undefined | null): UpdateMode {
  const v = (raw || 'soft').toLowerCase().trim();
  if (v === 'hard' || v === 'force' || v === 'block') return 'block';
  return 'soft';
}

interface VersionState {
  updateAvailable: boolean;
  updateMode: UpdateMode;
  currentVersion: string;
  handleRefresh: () => void;
  dismissUpdate: () => void;
}

async function fetchVersionSettings() {
  const { data, error } = await supabase
    .from('ops_settings')
    .select('key, value')
    .in('key', ['web_version', 'web_update_mode']);

  if (error) {
    log('fetch error', error);
    return null;
  }

  const version = data?.find(r => r.key === 'web_version')?.value || '1.0.0';
  const mode = normalizeMode(data?.find(r => r.key === 'web_update_mode')?.value);
  return { version, mode };
}

function getStoredVersion(): string {
  try { return localStorage.getItem(LS_KEY) || ''; } catch { return ''; }
}

function setStoredVersion(v: string) {
  try { localStorage.setItem(LS_KEY, v); } catch { /* noop */ }
}

export function useWebVersion(): VersionState {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateMode, setUpdateMode] = useState<UpdateMode>('soft');
  const [currentVersion, setCurrentVersion] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const latestVersion = useRef('');
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const check = useCallback(async () => {
    const result = await fetchVersionSettings();
    if (!result) return;

    const { version: remote, mode } = result;
    log('remote=', remote, 'mode=', mode, 'stored=', getStoredVersion());

    setCurrentVersion(remote);
    setUpdateMode(mode);
    latestVersion.current = remote;

    const stored = getStoredVersion();

    // First visit
    if (!stored) {
      setStoredVersion(remote);
      if (mode === 'block') {
        // Admin wants immediate block — force the update screen
        log('first visit + block mode => show blocking screen');
        setUpdateAvailable(true);
        setDismissed(false);
      } else {
        log('first visit + soft mode => seed silently');
        setUpdateAvailable(false);
      }
      return;
    }

    if (stored !== remote) {
      log('mismatch detected', stored, '→', remote);
      setUpdateAvailable(true);
      setDismissed(false);
    } else {
      setUpdateAvailable(false);
    }
  }, []);

  useEffect(() => {
    check();
    intervalRef.current = setInterval(check, POLL_MS);
    return () => clearInterval(intervalRef.current);
  }, [check]);

  const handleRefresh = useCallback(() => {
    const ver = latestVersion.current;
    if (ver) setStoredVersion(ver);

    // Best-effort: unregister service workers
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(r => r.unregister());
      }).catch(() => {});
    }

    // Best-effort: clear caches
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => caches.delete(name));
      }).catch(() => {});
    }

    log('refreshing with cache-bust…');

    // Cache-busting redirect for Capacitor WebView reliability
    const bustUrl =
      window.location.origin +
      window.location.pathname +
      '?v=' + encodeURIComponent(ver) +
      '&t=' + Date.now();

    setTimeout(() => {
      try {
        window.location.href = bustUrl;
      } catch {
        window.location.reload();
      }
    }, 100);
  }, []);

  const dismissUpdate = useCallback(() => {
    // Only soft mode can be dismissed
    if (updateMode === 'soft') {
      setDismissed(true);
    }
  }, [updateMode]);

  // Block mode is never dismissible
  const effectivelyAvailable =
    updateAvailable && (updateMode === 'block' ? true : !dismissed);

  return {
    updateAvailable: effectivelyAvailable,
    updateMode,
    currentVersion,
    handleRefresh,
    dismissUpdate,
  };
}
