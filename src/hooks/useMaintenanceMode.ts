import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentUser } from '@/lib/firebase';

const POLL_MS = 60 * 1000; // 60 seconds
const isDev = import.meta.env.DEV;

function log(...args: unknown[]) {
  if (isDev) console.log('[Maintenance]', ...args);
}

interface MaintenanceState {
  checking: boolean;
  isMaintenance: boolean;
  title: string;
  message: string;
  ctaLabel: string;
  recheck: () => void;
}

function toDigits(p: string): string {
  return p.replace(/[^\d+]/g, '').replace(/(?!^\+)\+/g, '');
}

function last10(digits: string): string {
  const d = digits.replace(/^\+/, '');
  return d.length >= 10 ? d.slice(-10) : d;
}

function isPhoneAllowlisted(phone: string | null | undefined, allowlist: string): boolean {
  if (!phone || !allowlist.trim()) return false;
  const phoneDigits = toDigits(phone);
  const phoneLast10 = last10(phoneDigits);
  const entries = allowlist.split(',').map(e => toDigits(e.trim())).filter(Boolean);
  return entries.some(entry => {
    // If entry has +, require exact match
    if (entry.startsWith('+')) return entry === phoneDigits;
    // Otherwise match exact or last-10-digit match
    const entryLast10 = last10(entry);
    return entry === phoneDigits || entryLast10 === phoneLast10;
  });
}

export function useMaintenanceMode(): MaintenanceState {
  const [state, setState] = useState<MaintenanceState>({
    checking: true,
    isMaintenance: false,
    title: '',
    message: '',
    ctaLabel: 'Retry',
    recheck: () => {},
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const check = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('ops_settings')
        .select('key, value')
        .in('key', [
          'maintenance_mode',
          'maintenance_title',
          'maintenance_message',
          'maintenance_cta_label',
          'maintenance_allowlist_phones',
        ]);

      if (error || !data) {
        log('fetch failed, fail-open', error);
        setState(s => ({ ...s, checking: false, isMaintenance: false }));
        return;
      }

      const get = (k: string) => data.find(r => r.key === k)?.value || '';
      const modeRaw = get('maintenance_mode').toLowerCase().trim();
      const isOn = modeRaw === 'on' || modeRaw === 'true' || modeRaw === '1';

      if (!isOn) {
        log('maintenance OFF');
        setState(s => ({ ...s, checking: false, isMaintenance: false }));
        return;
      }

      // Check allowlist
      const allowlist = get('maintenance_allowlist_phones');
      const fbUser = getCurrentUser();
      const userPhone = fbUser?.phoneNumber || null;

      if (isPhoneAllowlisted(userPhone, allowlist)) {
        log('maintenance ON but user allowlisted:', userPhone);
        setState(s => ({ ...s, checking: false, isMaintenance: false }));
        return;
      }

      log('maintenance ON, blocking');
      setState(s => ({
        ...s,
        checking: false,
        isMaintenance: true,
        title: get('maintenance_title') || 'Under Maintenance',
        message: get('maintenance_message') || 'We are performing scheduled maintenance. We\'ll be back shortly.',
        ctaLabel: get('maintenance_cta_label') || 'Retry',
      }));
    } catch (err) {
      log('error, fail-open', err);
      setState(s => ({ ...s, checking: false, isMaintenance: false }));
    }
  }, []);

  useEffect(() => {
    check();
    intervalRef.current = setInterval(check, POLL_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [check]);

  // Expose recheck so the retry button can trigger it
  useEffect(() => {
    setState(s => ({ ...s, recheck: check }));
  }, [check]);

  return state;
}
