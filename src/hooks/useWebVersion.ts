import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

const LS_KEY = 'didi_web_version';
const POLL_MS = 3 * 60 * 1000; // 3 minutes
const isDev = import.meta.env.DEV;

function log(...args: unknown[]) {
  if (isDev) console.log('[WebVersion]', ...args);
}

interface VersionState {
  updateAvailable: boolean;
  updateMode: 'soft' | 'force';
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
  const mode = (data?.find(r => r.key === 'web_update_mode')?.value || 'soft') as 'soft' | 'force';
  return { version, mode };
}

function getStoredVersion(): string {
  try {
    return localStorage.getItem(LS_KEY) || '';
  } catch {
    return '';
  }
}

function setStoredVersion(v: string) {
  try {
    localStorage.setItem(LS_KEY, v);
  } catch { /* noop */ }
}

export function useWebVersion(): VersionState {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateMode, setUpdateMode] = useState<'soft' | 'force'>('soft');
  const [currentVersion, setCurrentVersion] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const check = useCallback(async () => {
    const result = await fetchVersionSettings();
    if (!result) return;

    const { version: remote, mode } = result;
    log('remote=', remote, 'mode=', mode, 'stored=', getStoredVersion());

    setCurrentVersion(remote);
    setUpdateMode(mode);

    const stored = getStoredVersion();

    // First visit – seed localStorage, no update prompt
    if (!stored) {
      setStoredVersion(remote);
      log('first visit, seeded version');
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
    const result = currentVersion;
    if (result) setStoredVersion(result);

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

    log('refreshing…');
    setTimeout(() => {
      window.location.reload();
    }, 100);
  }, [currentVersion]);

  const dismissUpdate = useCallback(() => {
    setDismissed(true);
  }, []);

  return {
    updateAvailable: updateAvailable && !dismissed,
    updateMode,
    currentVersion,
    handleRefresh,
    dismissUpdate,
  };
}
