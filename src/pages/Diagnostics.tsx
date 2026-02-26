import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2, Copy, RefreshCw, Trash2, Globe, Wifi } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { getCurrentBackendUrl, switchBackend } from "@/integrations/supabase/client";
import { testAllCandidates, BACKEND_CANDIDATES, type BackendTestResult } from "@/lib/backendResolver";
import { supabase } from "@/integrations/supabase/client";

// @ts-ignore - injected by Vite define
const BUILD_ID = typeof __APP_BUILD_ID__ !== "undefined" ? __APP_BUILD_ID__ : "dev";

type TestStatus = "idle" | "running" | "pass" | "fail";

interface TestResult {
  status: TestStatus;
  detail?: string;
  ms?: number;
}

export default function Diagnostics() {
  const [rest, setRest] = useState<TestResult>({ status: "idle" });
  const [auth, setAuth] = useState<TestResult>({ status: "idle" });
  const [ws, setWs] = useState<TestResult>({ status: "idle" });
  const [hasSW, setHasSW] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [candidateResults, setCandidateResults] = useState<BackendTestResult[]>([]);
  const [testingCandidates, setTestingCandidates] = useState(false);

  const currentUrl = getCurrentBackendUrl();

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        setHasSW(regs.length > 0);
      });
    }
  }, []);

  const runRest = useCallback(async () => {
    const base = getCurrentBackendUrl();
    if (!base) return;
    setRest({ status: "running" });
    const t0 = Date.now();
    try {
      const res = await fetch(`${base}/rest/v1/`, {
        method: "GET",
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      });
      const ms = Date.now() - t0;
      setRest(res.ok ? { status: "pass", detail: `HTTP ${res.status}`, ms } : { status: "fail", detail: `HTTP ${res.status}`, ms });
    } catch (e: any) {
      setRest({ status: "fail", detail: e?.message || "Network error", ms: Date.now() - t0 });
    }
  }, []);

  const runAuth = useCallback(async () => {
    setAuth({ status: "running" });
    const t0 = Date.now();
    try {
      const { data, error } = await supabase.auth.getSession();
      const ms = Date.now() - t0;
      if (error) {
        setAuth({ status: "fail", detail: error.message, ms });
      } else {
        setAuth({ status: "pass", detail: data.session ? "Session exists" : "No session (anonymous)", ms });
      }
    } catch (e: any) {
      setAuth({ status: "fail", detail: e?.message || "Error", ms: Date.now() - t0 });
    }
  }, []);

  const runWs = useCallback(() => {
    const base = getCurrentBackendUrl();
    if (!base) return;
    setWs({ status: "running" });
    const t0 = Date.now();
    const wsUrl = `${base.replace("https", "wss")}/realtime/v1/websocket?apikey=${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}&vsn=1.0.0`;
    try {
      const socket = new WebSocket(wsUrl);
      const timeout = setTimeout(() => {
        socket.close();
        setWs({ status: "fail", detail: "Timeout (5s)", ms: Date.now() - t0 });
      }, 5000);
      socket.onopen = () => {
        clearTimeout(timeout);
        setWs({ status: "pass", detail: "Connected", ms: Date.now() - t0 });
        socket.close();
      };
      socket.onerror = () => {
        clearTimeout(timeout);
        setWs({ status: "fail", detail: "WebSocket error", ms: Date.now() - t0 });
      };
    } catch (e: any) {
      setWs({ status: "fail", detail: e?.message || "Error", ms: Date.now() - t0 });
    }
  }, []);

  const runAll = useCallback(() => {
    runRest();
    runAuth();
    runWs();
  }, [runRest, runAuth, runWs]);

  const handleTestCandidates = useCallback(async () => {
    setTestingCandidates(true);
    setCandidateResults([]);
    const results = await testAllCandidates(4000);
    setCandidateResults(results);
    setTestingCandidates(false);
  }, []);

  const handleSwitchBackend = useCallback(async () => {
    setSwitching(true);
    const ok = await switchBackend();
    setSwitching(false);
    if (ok) {
      toast({ title: "Backend switched", description: `Now using ${getCurrentBackendUrl()}` });
      runAll();
    } else {
      toast({ title: "All backends unreachable", variant: "destructive" });
    }
  }, [runAll]);

  const hardRefresh = useCallback(async () => {
    setClearing(true);
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      localStorage.removeItem("DIDI_BACKEND_URL");
      window.location.reload();
    } catch {
      setClearing(false);
      toast({ title: "Failed to clear cache", variant: "destructive" });
    }
  }, []);

  const statusLabel = (s: TestStatus) =>
    s === "pass" ? "✅ PASS" : s === "fail" ? "❌ FAIL" : s === "running" ? "⏳ Running" : "—";

  const copyDebug = useCallback(() => {
    const lines = [
      `URL: ${window.location.href}`,
      `Active Backend: ${currentUrl || "unknown"}`,
      `Build ID: ${BUILD_ID}`,
      `User-Agent: ${navigator.userAgent}`,
      `Timestamp: ${new Date().toISOString()}`,
      `SW registered: ${hasSW ? "Yes" : "No"}`,
      "",
      `REST API: ${statusLabel(rest.status)}${rest.detail ? ` (${rest.detail})` : ""}${rest.ms != null ? ` ${rest.ms}ms` : ""}`,
      `Auth: ${statusLabel(auth.status)}${auth.detail ? ` (${auth.detail})` : ""}${auth.ms != null ? ` ${auth.ms}ms` : ""}`,
      `Realtime WS: ${statusLabel(ws.status)}${ws.detail ? ` (${ws.detail})` : ""}${ws.ms != null ? ` ${ws.ms}ms` : ""}`,
      "",
      "Candidates:",
      ...candidateResults.map((r) => `  ${r.ok ? "✅" : "❌"} ${r.url} (${r.ms}ms)${r.error ? ` – ${r.error}` : ""}`),
    ];
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      toast({ title: "Copied to clipboard" });
    });
  }, [rest, auth, ws, hasSW, currentUrl, candidateResults]);

  const StatusIcon = ({ status }: { status: TestStatus }) => {
    if (status === "running") return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;
    if (status === "pass") return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
    if (status === "fail") return <XCircle className="w-5 h-5 text-destructive" />;
    return <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />;
  };

  const TestRow = ({ label, result }: { label: string; result: TestResult }) => (
    <div className="flex items-center justify-between py-3 border-b last:border-0 border-border">
      <div className="flex items-center gap-3">
        <StatusIcon status={result.status} />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="text-right">
        <span className="text-xs text-muted-foreground">{result.detail || ""}</span>
        {result.ms != null && <span className="text-xs text-muted-foreground ml-2">{result.ms}ms</span>}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-4 max-w-lg mx-auto space-y-4">
      {/* Active Backend */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">Active Backend</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <code className="text-xs font-mono bg-muted px-2 py-1 rounded block truncate">
            {currentUrl || "Not resolved"}
          </code>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSwitchBackend}
            disabled={switching}
            className="mt-2 gap-2 w-full"
          >
            {switching ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Re-test & switch backend
          </Button>
        </CardContent>
      </Card>

      {/* Connectivity Tests */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Connectivity Tests</CardTitle>
          <p className="text-xs text-muted-foreground">
            Build: {BUILD_ID} · SW: {hasSW ? "Yes" : "No"}
          </p>
        </CardHeader>
        <CardContent className="space-y-0">
          <TestRow label="REST API" result={rest} />
          <TestRow label="Auth (getSession)" result={auth} />
          <TestRow label="Realtime WebSocket" result={ws} />
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={runAll} className="flex-1 gap-2">
          <RefreshCw className="w-4 h-4" /> Run All Tests
        </Button>
        <Button variant="outline" onClick={copyDebug} className="gap-2">
          <Copy className="w-4 h-4" /> Copy
        </Button>
      </div>

      {/* Candidate URLs */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Wifi className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">Backend Candidates</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {BACKEND_CANDIDATES.map((url) => {
            const result = candidateResults.find((r) => r.url === url);
            const isActive = url === currentUrl;
            return (
              <div
                key={url}
                className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${
                  isActive ? "border-primary/40 bg-primary/5" : "border-border"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {result ? (
                    result.ok ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                    ) : (
                      <XCircle className="w-4 h-4 shrink-0 text-destructive" />
                    )
                  ) : (
                    <div className="w-4 h-4 shrink-0 rounded-full border-2 border-muted-foreground/30" />
                  )}
                  <span className="font-mono truncate">
                    {new URL(url).hostname}
                  </span>
                  {isActive && (
                    <span className="text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                      ACTIVE
                    </span>
                  )}
                </div>
                <span className="text-muted-foreground shrink-0 ml-2">
                  {result ? `${result.ms}ms` : "—"}
                </span>
              </div>
            );
          })}
          <Button
            size="sm"
            variant="outline"
            onClick={handleTestCandidates}
            disabled={testingCandidates}
            className="w-full gap-2 mt-1"
          >
            {testingCandidates ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Test All Candidates
          </Button>
        </CardContent>
      </Card>

      <Button
        variant="destructive"
        onClick={hardRefresh}
        disabled={clearing}
        className="w-full gap-2"
      >
        {clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        Clear cache & reload
      </Button>
      <p className="text-[10px] text-muted-foreground text-center">
        Clears backend cache, service workers, Cache Storage, and force-reloads.
      </p>
    </div>
  );
}
