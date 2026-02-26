import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { WifiOff, RefreshCw, ChevronDown, ChevronUp, Shield } from "lucide-react";

interface Props {
  onRetry: () => void;
}

export function NetworkBlockedScreen({ onRetry }: Props) {
  const [showSteps, setShowSteps] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-5">
        <WifiOff className="w-8 h-8 text-destructive" />
      </div>

      <h1 className="text-xl font-bold text-foreground mb-2">Network Issue</h1>
      <p className="text-sm text-muted-foreground max-w-xs mb-6">
        Your internet provider may be blocking our servers. Try switching to a different network or enabling Private DNS.
      </p>

      <div className="flex gap-3 w-full max-w-xs mb-4">
        <Button onClick={onRetry} className="flex-1 gap-2">
          <RefreshCw className="w-4 h-4" /> Try Again
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowSteps((v) => !v)}
          className="flex-1 gap-2"
        >
          <Shield className="w-4 h-4" />
          How to fix
          {showSteps ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </Button>
      </div>

      {showSteps && (
        <div className="w-full max-w-xs bg-muted/50 rounded-lg p-4 text-left space-y-3 border border-border">
          <p className="text-xs font-semibold text-foreground">Android – Private DNS</p>
          <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
            <li>Open <strong>Settings → Network & internet → Private DNS</strong></li>
            <li>Select <strong>"Private DNS provider hostname"</strong></li>
            <li>
              Enter one of these:
              <div className="mt-1 space-y-1">
                <code className="block bg-background px-2 py-1 rounded text-[11px] font-mono border border-border">dns.google</code>
                <code className="block bg-background px-2 py-1 rounded text-[11px] font-mono border border-border">1dot1dot1dot1.cloudflare-dns.com</code>
              </div>
            </li>
            <li>Tap <strong>Save</strong>, then come back and tap <strong>Try Again</strong></li>
          </ol>

          <p className="text-xs font-semibold text-foreground pt-2">iPhone</p>
          <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
            <li>Open <strong>Settings → Wi-Fi</strong></li>
            <li>Tap the <strong>(i)</strong> next to your network</li>
            <li>Scroll to <strong>DNS → Configure DNS → Manual</strong></li>
            <li>Add <strong>8.8.8.8</strong> and <strong>1.1.1.1</strong></li>
            <li>Save, then come back and tap <strong>Try Again</strong></li>
          </ol>
        </div>
      )}

      <a
        href="/diagnostics"
        className="mt-4 text-xs text-primary underline underline-offset-2"
      >
        Open full diagnostics
      </a>
    </div>
  );
}
