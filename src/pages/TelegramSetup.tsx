import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Copy, Check, ExternalLink } from 'lucide-react';

export default function TelegramSetup() {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const { toast } = useToast();

  const [functionUrl, setFunctionUrl] = useState(
    'https://paywwbuqycovjopryele.functions.supabase.co/new-booking-telegram'
  );
  const [webhookSecret, setWebhookSecret] = useState('');
  const [testPayload, setTestPayload] = useState(JSON.stringify({
    type: "INSERT",
    table: "bookings",
    schema: "public",
    record: {
      service_type: "maid",
      booking_type: "instant",
      community: "Prestige High Fields",
      flat_no: "1011",
      scheduled_date: "2025-10-08",
      scheduled_time: "15:00",
      price_inr: 200,
      cust_name: "Sayyad",
      cust_phone: "+91 80081 80018",
      status: "pending",
      id: "bk_test_123"
    }
  }, null, 2));

  const commands = [
    'supabase secrets set TELEGRAM_BOT_TOKEN=<PASTE_NEW_BOT_TOKEN_HERE>',
    'supabase secrets set TELEGRAM_CHAT_ID=4825337892',
    '# optional\nsupabase secrets set WEBHOOK_SHARED_SECRET=<make-a-long-random-string>',
    'supabase functions deploy new-booking-telegram'
  ];

  const copyToClipboard = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
      toast({
        title: "Copied!",
        description: "Command copied to clipboard",
      });
    } catch (err) {
      toast({
        title: "Failed to copy",
        variant: "destructive",
      });
    }
  };

  const sendTestRequest = async () => {
    setLoading(true);
    setResponse(null);

    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (webhookSecret.trim()) {
        headers['x-webhook-secret'] = webhookSecret.trim();
      }

      const res = await fetch(functionUrl, {
        method: 'POST',
        headers,
        body: testPayload
      });

      const data = await res.json();
      
      setResponse({
        status: res.status,
        ok: res.ok,
        data
      });

      if (res.ok && (data.ok || data.success)) {
        toast({
          title: "✅ Test Successful!",
          description: "Telegram message sent—check chat 4825337892",
        });
      } else {
        toast({
          title: "❌ Test Failed",
          description: data?.error || JSON.stringify(data),
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('Test error:', error);
      setResponse({
        error: error.message,
        stack: error.stack
      });
      toast({
        title: "❌ Network Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Telegram Setup & Testing</h1>
        <p className="text-muted-foreground mt-2">
          Configure Telegram secrets for the new-booking-telegram Edge Function
        </p>
      </div>

      {/* Step 1: Secrets */}
      <Card>
        <CardHeader>
          <CardTitle>Step 1: Add Secrets</CardTitle>
          <CardDescription>
            Run these commands in your terminal (requires Supabase CLI)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {commands.slice(0, 3).map((cmd, idx) => (
            <div key={idx} className="relative">
              <pre className="bg-muted p-3 rounded-lg text-sm overflow-x-auto pr-12">
                {cmd}
              </pre>
              <Button
                size="sm"
                variant="ghost"
                className="absolute top-2 right-2"
                onClick={() => copyToClipboard(cmd, idx)}
              >
                {copiedIndex === idx ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          ))}
          <p className="text-sm text-muted-foreground border-l-4 border-yellow-500 pl-3 py-2">
            <strong>Note:</strong> If you posted your token earlier, revoke and regenerate in @BotFather 
            (/revoke then /token) and paste the NEW token.
          </p>
        </CardContent>
      </Card>

      {/* Step 2: Deploy */}
      <Card>
        <CardHeader>
          <CardTitle>Step 2: Deploy Edge Function</CardTitle>
          <CardDescription>
            Deploy the function after setting secrets
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <pre className="bg-muted p-3 rounded-lg text-sm overflow-x-auto pr-12">
              {commands[3]}
            </pre>
            <Button
              size="sm"
              variant="ghost"
              className="absolute top-2 right-2"
              onClick={() => copyToClipboard(commands[3], 3)}
            >
              {copiedIndex === 3 ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Step 3: Webhook */}
      <Card>
        <CardHeader>
          <CardTitle>Step 3: Configure Database Webhook</CardTitle>
          <CardDescription>
            Set up the webhook in Supabase Dashboard
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Function URL (Webhook Destination)</Label>
            <div className="relative mt-2">
              <Input
                value={functionUrl}
                readOnly
                className="pr-12 font-mono text-sm"
              />
              <Button
                size="sm"
                variant="ghost"
                className="absolute top-1/2 -translate-y-1/2 right-2"
                onClick={() => copyToClipboard(functionUrl, 10)}
              >
                {copiedIndex === 10 ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <div className="bg-muted p-4 rounded-lg text-sm space-y-2">
            <p className="font-semibold">Instructions:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Go to Dashboard → Database → Webhooks → Create</li>
              <li>Event: <code className="bg-background px-1">INSERT</code></li>
              <li>Schema: <code className="bg-background px-1">public</code></li>
              <li>Table: <code className="bg-background px-1">bookings</code></li>
              <li>URL: Paste the function URL above</li>
              <li>Header (optional): <code className="bg-background px-1">x-webhook-secret: &lt;YOUR_SECRET&gt;</code></li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* Debug Links */}
      <Card>
        <CardHeader>
          <CardTitle>Debug Links</CardTitle>
          <CardDescription>
            Quick access to Supabase dashboard pages
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => window.open('https://supabase.com/dashboard/project/paywwbuqycovjopryele/functions/new-booking-telegram/logs', '_blank')}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Edge Function Logs
          </Button>
          <Button
            variant="outline"
            onClick={() => window.open('https://supabase.com/dashboard/project/paywwbuqycovjopryele/settings/functions', '_blank')}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Edge Functions Secrets
          </Button>
          <Button
            variant="outline"
            onClick={() => window.open('https://supabase.com/dashboard/project/paywwbuqycovjopryele/database/webhooks', '_blank')}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Database Webhooks
          </Button>
        </CardContent>
      </Card>

      {/* Live Test */}
      <Card>
        <CardHeader>
          <CardTitle>Live Test Caller</CardTitle>
          <CardDescription>
            Send a test webhook payload to the Edge Function
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="function-url">Function URL</Label>
            <Input
              id="function-url"
              value={functionUrl}
              onChange={(e) => setFunctionUrl(e.target.value)}
              className="font-mono text-sm mt-2"
            />
          </div>
          
          <div>
            <Label htmlFor="webhook-secret">
              x-webhook-secret <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="webhook-secret"
              type="password"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder="Leave empty if not using"
              className="mt-2"
            />
          </div>

          <div>
            <Label htmlFor="test-payload">Test Payload (JSON)</Label>
            <Textarea
              id="test-payload"
              value={testPayload}
              onChange={(e) => setTestPayload(e.target.value)}
              rows={16}
              className="font-mono text-sm mt-2"
            />
          </div>

          <Button 
            onClick={sendTestRequest} 
            disabled={loading}
            className="w-full"
            size="lg"
          >
            {loading ? "Sending..." : "📤 Send Test to Edge Function"}
          </Button>

          {response && (
            <div className="mt-4">
              <Label className="mb-2 block">Response:</Label>
              <pre className="bg-muted p-4 rounded-lg overflow-auto text-xs max-h-96">
                {JSON.stringify(response, null, 2)}
              </pre>
            </div>
          )}

          <p className="text-sm text-muted-foreground border-l-4 border-blue-500 pl-3 py-2">
            <strong>Note:</strong> If Telegram fails due to Markdown formatting, remove{' '}
            <code className="bg-background px-1">parse_mode: 'Markdown'</code> in your function and retry.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
