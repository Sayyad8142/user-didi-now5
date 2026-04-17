import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { cn } from '@/lib/utils';

const BUILD_TIME_ISO =
  typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : new Date().toISOString();
const BUILD_ID =
  typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev';

function formatBuildTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    // e.g. "2026-04-18 05:20 PM"
    const date = d.toLocaleDateString('en-CA'); // YYYY-MM-DD
    const time = d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `${date} ${time}`;
  } catch {
    return iso;
  }
}

interface NativeInfo {
  versionName: string;
  versionCode: string | number;
}

interface AppVersionDisplayProps {
  className?: string;
  variant?: 'default' | 'compact';
}

export function AppVersionDisplay({ className, variant = 'default' }: AppVersionDisplayProps) {
  const [native, setNative] = useState<NativeInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!Capacitor.isNativePlatform()) return;
    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const info = await App.getInfo();
        if (!cancelled) {
          setNative({ versionName: info.version, versionCode: info.build });
        }
      } catch (e) {
        // Plugin unavailable (web) — silently ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const buildTime = formatBuildTime(BUILD_TIME_ISO);
  const versionLine = native
    ? `Version ${native.versionName} (code ${native.versionCode})`
    : `Web build ${BUILD_ID}`;

  if (variant === 'compact') {
    return (
      <div
        className={cn(
          'text-[10px] leading-tight text-muted-foreground/70 text-center',
          className,
        )}
      >
        {versionLine} · {buildTime}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'text-[11px] leading-snug text-muted-foreground/80 text-center py-2 select-text',
        className,
      )}
    >
      <div>{versionLine}</div>
      <div>Build: {buildTime}</div>
    </div>
  );
}
