import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2, Copy, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://api.didisnow.com";
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

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

  const runRest = useCallback(async () => {
    setRest({ status: "running" });
    const t0 = Date.now();
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/?apikey=${ANON_KEY}`, { method: "GET" });
      const ms = Date.now() - t0;
      if (res.ok) {
        setRest({ status: "pass", detail: `HTTP ${res.status}`, ms });
      } else {
        setRest({ status: "fail", detail: `HTTP ${res.status}`, ms });
      }
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
        const hasSession = !!data.session;
        setAuth({ status: "pass", detail: hasSession ? "Session exists" : "No session (anonymous)", ms });
      }
    } catch (e: any) {
      setAuth({ status: "fail", detail: e?.message || "Error", ms: Date.now() - t0 });
    }
  }, []);

  const runWs = useCallback(() => {
    setWs({ status: "running" });
    const t0 = Date.now();
    const wsUrl = `${SUPABASE_URL.replace("https", "wss")}/realtime/v1/websocket?apikey=${ANON_KEY}&vsn=1.0.0`;
    try {
      const socket = new WebSocket(wsUrl);
      const timeout = setTimeout(() => {
        socket.close();
        setWs({ status: "fail", detail: "Timeout (5s)", ms: Date.now() - t0 });
      }, 5000);

      socket.onopen = () => {
        clearTimeout(timeout);
        const ms = Date.now() - t0;
        setWs({ status: "pass", detail: "Connected", ms });
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

  const statusLabel = (s: TestStatus) => s === "pass" ? "✅ PASS" : s === "fail" ? "❌ FAIL" : s === "running" ? "⏳ Running" : "—";

  const copyDebug = useCallback(() => {
    const domain = new URL(SUPABASE_URL).hostname;
    const lines = [
      `URL: ${window.location.href}`,
      `DNS domain: ${domain}`,
      `User-Agent: ${navigator.userAgent}`,
      `Timestamp: ${new Date().toISOString()}`,
      ``,
      `REST API: ${statusLabel(rest.status)}${rest.detail ? ` (${rest.detail})` : ""}${rest.ms != null ? ` ${rest.ms}ms` : ""}`,
      `Auth: ${statusLabel(auth.status)}${auth.detail ? ` (${auth.detail})` : ""}${auth.ms != null ? ` ${auth.ms}ms` : ""}`,
      `Realtime WS: ${statusLabel(ws.status)}${ws.detail ? ` (${ws.detail})` : ""}${ws.ms != null ? ` ${ws.ms}ms` : ""}`,
    ];
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      toast({ title: "Copied to clipboard" });
    });
  }, [rest, auth, ws]);

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
    <div className="min-h-screen bg-background p-4 max-w-lg mx-auto">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Network Diagnostics</CardTitle>
          <p className="text-xs text-muted-foreground">Test connectivity to Supabase backend</p>
        </CardHeader>
        <CardContent className="space-y-0">
          <TestRow label="REST API" result={rest} />
          <TestRow label="Auth (getSession)" result={auth} />
          <TestRow label="Realtime WebSocket" result={ws} />
        </CardContent>
      </Card>

      <div className="flex gap-2 mt-4">
        <Button onClick={runAll} className="flex-1 gap-2">
          <RefreshCw className="w-4 h-4" /> Run All Tests
        </Button>
        <Button variant="outline" onClick={copyDebug} className="gap-2">
          <Copy className="w-4 h-4" /> Copy Debug Info
        </Button>
      </div>
    </div>
  );
}
