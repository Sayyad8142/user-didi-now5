import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { semverLt } from '@/lib/semver';
import { getAppPlatform } from '@/utils/platform';

const isDev = import.meta.env.DEV;
const CACHE_KEY = 'didi_native_app_config';
const SOFT_DISMISS_KEY = 'didi_soft_update_dismissed_at';
const SOFT_DISMISS_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

function log(...args: unknown[]) {
  if (isDev) console.log('[NativeVersionGate]', ...args);
}

export type AppStatus = 'loading' | 'ok' | 'soft_update' | 'force_update' | 'maintenance';

interface AppConfig {
  min_user_version_code: number;
  min_user_version_name: string;
  latest_version_name: string;
  force_update: boolean;
  soft_update_enabled: boolean;
  user_update_message: string;
  update_title: string;
  soft_update_message: string;
  play_store_url_user: string;
  ios_store_url: string;
  release_notes: string;
}

export interface NativeVersionGateState {
  checking: boolean;
  status: AppStatus;
  blocked: boolean;
  message: string;
  title: string;
  storeUrl: string;
  currentVersion: string;
  requiredVersion: string;
  latestVersion: string;
  releaseNotes: string;
  dismissSoftUpdate: () => void;
}

function getCachedConfig(): AppConfig | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setCachedConfig(config: AppConfig) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(config)); } catch {}
}

function isSoftDismissed(): boolean {
  try {
    const ts = localStorage.getItem(SOFT_DISMISS_KEY);
    if (!ts) return false;
    return Date.now() - parseInt(ts, 10) < SOFT_DISMISS_COOLDOWN_MS;
  } catch { return false; }
}

function dismissSoft() {
  try { localStorage.setItem(SOFT_DISMISS_KEY, String(Date.now())); } catch {}
}

/** Resolve the correct store URL based on the current platform */
function resolveStoreUrl(config: AppConfig): string {
  const platform = getAppPlatform();
  if (platform === 'ios') return config.ios_store_url || '';
  // Android or web fallback
  return config.play_store_url_user || '';
}

async function fetchConfig(): Promise<AppConfig | null> {
  const { data, error } = await supabase
    .from('app_config')
    .select('min_user_version_code, min_user_version_name, latest_version_name, force_update, soft_update_enabled, user_update_message, update_title, soft_update_message, play_store_url_user, ios_store_url, release_notes')
    .limit(1)
    .single();

  if (error || !data) {
    log('fetch failed', error);
    return null;
  }
  return data as AppConfig;
}

function computeStatus(
  currentVersionName: string,
  currentVersionCode: number,
  config: AppConfig
): { status: AppStatus; message: string; title: string } {
  // Force update flag overrides everything
  if (config.force_update) {
    log('force_update flag is ON');
    return {
      status: 'force_update',
      title: config.update_title || 'Update Required',
      message: config.user_update_message,
    };
  }

  // Check version code (integer comparison)
  if (currentVersionCode < (config.min_user_version_code ?? 0)) {
    log('versionCode too low:', currentVersionCode, '<', config.min_user_version_code);
    return {
      status: 'force_update',
      title: config.update_title || 'Update Required',
      message: config.user_update_message,
    };
  }

  // Check semver: current < minimum → force
  if (semverLt(currentVersionName, config.min_user_version_name)) {
    log('version too old:', currentVersionName, '<', config.min_user_version_name);
    return {
      status: 'force_update',
      title: config.update_title || 'Update Required',
      message: config.user_update_message,
    };
  }

  // Check semver: current < latest → soft update (only if enabled)
  if (
    config.soft_update_enabled &&
    semverLt(currentVersionName, config.latest_version_name)
  ) {
    log('newer version available:', currentVersionName, '<', config.latest_version_name);
    return {
      status: 'soft_update',
      title: config.update_title || 'Update Available',
      message: config.soft_update_message || config.user_update_message,
    };
  }

  return { status: 'ok', title: '', message: '' };
}

export function useNativeVersionGate(): NativeVersionGateState {
  const [state, setState] = useState<NativeVersionGateState>({
    checking: true,
    status: 'loading',
    blocked: false,
    message: '',
    title: '',
    storeUrl: '',
    currentVersion: '',
    requiredVersion: '',
    latestVersion: '',
    releaseNotes: '',
    dismissSoftUpdate: () => {},
  });

  const appInfoRef = useRef<{ version: string; build: string } | null>(null);

  const check = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      log('not native, skipping');
      setState(s => ({ ...s, checking: false, status: 'ok' }));
      return;
    }

    try {
      // Get native app info (cache it so resume checks are fast)
      if (!appInfoRef.current) {
        const { App: CapApp } = await import('@capacitor/app');
        appInfoRef.current = await CapApp.getInfo();
      }
      const info = appInfoRef.current;
      const currentVersionCode = parseInt(info.build, 10) || 0;
      const currentVersionName = info.version || '0.0.0';

      log('native version:', currentVersionName, 'code:', currentVersionCode);

      // Try remote fetch
      let config = await fetchConfig();

      if (!config) {
        config = getCachedConfig();
        if (config) {
          log('using cached config');
        } else {
          log('no config available, allowing through');
          setState(s => ({ ...s, checking: false, status: 'ok' }));
          return;
        }
      } else {
        setCachedConfig(config);
      }

      const { status, message, title } = computeStatus(currentVersionName, currentVersionCode, config);
      const storeUrl = resolveStoreUrl(config);
      log('computed status:', status, 'storeUrl:', storeUrl);

      setState(s => ({
        ...s,
        checking: false,
        status,
        blocked: status === 'force_update',
        message,
        title,
        storeUrl,
        currentVersion: currentVersionName,
        requiredVersion: config!.min_user_version_name || '',
        latestVersion: config!.latest_version_name || '',
        releaseNotes: config!.release_notes || '',
      }));
    } catch (err) {
      log('error during check, allowing through', err);
      setState(s => ({ ...s, checking: false, status: 'ok' }));
    }
  }, []);

  // Initial check
  useEffect(() => {
    check();
  }, [check]);

  // Foreground re-check
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let listenerHandle: any;

    (async () => {
      try {
        const { App: CapApp } = await import('@capacitor/app');
        const handle = await CapApp.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            log('app resumed, re-checking');
            check();
          }
        });
        listenerHandle = handle;
      } catch (err) {
        log('failed to add resume listener', err);
      }
    })();

    return () => {
      if (listenerHandle) listenerHandle.remove();
    };
  }, [check]);

  // Soft update dismissal handler
  useEffect(() => {
    setState(s => ({
      ...s,
      dismissSoftUpdate: () => {
        dismissSoft();
        setState(prev => ({ ...prev, status: 'ok' }));
      },
    }));
  }, []);

  // If soft update was dismissed within cooldown, downgrade to ok
  useEffect(() => {
    if (state.status === 'soft_update' && isSoftDismissed()) {
      log('soft update dismissed within cooldown, hiding');
      setState(s => ({ ...s, status: 'ok' }));
    }
  }, [state.status]);

  return state;
}
