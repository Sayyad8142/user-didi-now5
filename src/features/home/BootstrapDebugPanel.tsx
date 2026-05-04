import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { getBootstrapDiagnostics } from '@/lib/profileBootstrap';

/**
 * Small collapsible diagnostic panel showing which bootstrap endpoints
 * were tried and the last error. Helps debug profile-load failures.
 */
export function BootstrapDebugPanel() {
  const [open, setOpen] = useState(false);
  const diag = getBootstrapDiagnostics();

  if (diag.attempts.length === 0 && !diag.lastError) return null;

  const shortUrl = (u: string) => u.replace(/^https?:\/\//, '').replace('/functions/v1/bootstrap-profile', '');

  return (
    <div className="w-full max-w-md rounded-lg border border-border bg-muted/40 text-left text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 font-medium text-muted-foreground"
      >
        <span>Debug info ({diag.attempts.length} attempt{diag.attempts.length === 1 ? '' : 's'})</span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="space-y-2 border-t border-border px-3 py-2">
          {diag.lastRunAt && (
            <div className="text-muted-foreground">
              <span className="font-semibold">Last run:</span> {new Date(diag.lastRunAt).toLocaleTimeString()}
            </div>
          )}

          <div>
            <div className="mb-1 font-semibold text-muted-foreground">Endpoints tried:</div>
            <ul className="space-y-1">
              {diag.attempts.map((a, i) => (
                <li
                  key={i}
                  className={`flex items-start justify-between gap-2 rounded px-2 py-1 ${
                    a.ok ? 'bg-emerald-500/10 text-emerald-700' : 'bg-destructive/10 text-destructive'
                  }`}
                >
                  <span className="break-all font-mono">{shortUrl(a.url)}</span>
                  <span className="shrink-0 font-mono">
                    {a.ok ? 'OK' : a.status ?? 'ERR'}
                  </span>
                </li>
              ))}
              {diag.attempts.length === 0 && (
                <li className="text-muted-foreground">No attempts recorded.</li>
              )}
            </ul>
          </div>

          {diag.lastError && (
            <div>
              <div className="mb-1 font-semibold text-muted-foreground">Last error:</div>
              <div className="break-words rounded bg-destructive/10 px-2 py-1 font-mono text-destructive">
                {diag.lastError}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
