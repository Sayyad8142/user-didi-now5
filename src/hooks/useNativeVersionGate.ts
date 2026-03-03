import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { supabase } from '@/integrations/supabase/client';

const isDev = import.meta.env.DEV;
function log(...args: unknown[]) {
  if (isDev) console.log('[NativeVersionGate]', ...args);
}

interface NativeVersionGateState {
  checking: boolean;
  blocked: boolean;
  message: string;
  storeUrl: string;
  currentVersion: string;
  requiredVersion: string;
}

export function useNativeVersionGate(): NativeVersionGateState {
  const [state, setState] = useState<NativeVersionGateState>({
    checking: true,
    blocked: false,
    message: '',
    storeUrl: '',
    currentVersion: '',
    requiredVersion: '',
  });

  useEffect(() => {
    let cancelled = false;

    async function check() {
      // Only run on native platforms
      if (!Capacitor.isNativePlatform()) {
        log('not native, skipping');
        setState(s => ({ ...s, checking: false }));
        return;
      }

      try {
        const info = await CapApp.getInfo();
        const nativeVersionCode = parseInt(info.build, 10) || 0;
        log('native versionCode=', nativeVersionCode, 'versionName=', info.version);

        const { data, error } = await supabase
          .from('app_config')
          .select('min_user_version_code, min_user_version_name, user_update_message, play_store_url_user')
          .limit(1)
          .single();

        if (error || !data) {
          log('failed to fetch app_config, allowing through', error);
          if (!cancelled) setState(s => ({ ...s, checking: false }));
          return;
        }

        const minCode = data.min_user_version_code ?? 1;
        const minName = data.min_user_version_name ?? '1.0.0';
        const msg = data.user_update_message ?? 'Please update the app to continue.';
        const url = data.play_store_url_user ?? '';

        log('minCode=', minCode, 'nativeCode=', nativeVersionCode);

        if (nativeVersionCode < minCode) {
          log('BLOCKED: native version too old');
          if (!cancelled) {
            setState({
              checking: false,
              blocked: true,
              message: msg,
              storeUrl: url,
              currentVersion: info.version,
              requiredVersion: minName,
            });
          }
        } else {
          log('version OK');
          if (!cancelled) setState(s => ({ ...s, checking: false }));
        }
      } catch (err) {
        log('error during check, allowing through', err);
        if (!cancelled) setState(s => ({ ...s, checking: false }));
      }
    }

    check();
    return () => { cancelled = true; };
  }, []);

  return state;
}
