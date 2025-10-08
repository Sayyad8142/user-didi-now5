import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

export default function TestTelegram() {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const { toast } = useToast();

  const testTelegramNotification = async () => {
    setLoading(true);
    setResponse(null);

    const testPayload = {
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
    };

    try {
      const functionUrl = 'https://paywwbuqycovjopryele.functions.supabase.co/new-booking-telegram';
      
      console.log('Sending test payload to:', functionUrl);
      console.log('Payload:', JSON.stringify(testPayload, null, 2));

      const res = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Uncomment if WEBHOOK_SHARED_SECRET is set:
          // 'x-webhook-secret': '<YOUR_WEBHOOK_SHARED_SECRET>',
        },
        body: JSON.stringify(testPayload)
      });

      const data = await res.json();
      
      console.log('Response status:', res.status);
      console.log('Response data:', data);

      setResponse({
        status: res.status,
        ok: res.ok,
        data
      });

      if (res.ok && (data.ok || data.success)) {
        toast({
          title: "✅ Test Successful!",
          description: "Telegram message sent. Check your Telegram chat!",
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
    <div className="container mx-auto p-8 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>🔔 Test Telegram Notification</CardTitle>
          <CardDescription>
            Send a test webhook payload to the new-booking-telegram Edge Function
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Function URL: <code className="bg-muted px-2 py-1 rounded">
                https://paywwbuqycovjopryele.functions.supabase.co/new-booking-telegram
              </code>
            </p>
            <p className="text-sm text-muted-foreground">
              Expected Telegram Chat ID: <strong>4825337892</strong>
            </p>
          </div>

          <Button 
            onClick={testTelegramNotification} 
            disabled={loading}
            className="w-full"
          >
            {loading ? "Sending Test..." : "📤 Send Test Telegram Alert"}
          </Button>

          {response && (
            <div className="mt-4">
              <h3 className="font-semibold mb-2">Response:</h3>
              <pre className="bg-muted p-4 rounded-lg overflow-auto text-xs">
                {JSON.stringify(response, null, 2)}
              </pre>
            </div>
          )}

          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <h4 className="font-semibold mb-2">Expected Test Payload:</h4>
            <pre className="text-xs overflow-auto">
{`{
  "type": "INSERT",
  "table": "bookings",
  "schema": "public",
  "record": {
    "service_type": "maid",
    "booking_type": "instant",
    "community": "Prestige High Fields",
    "flat_no": "1011",
    "scheduled_date": "2025-10-08",
    "scheduled_time": "15:00",
    "price_inr": 200,
    "cust_name": "Sayyad",
    "cust_phone": "+91 80081 80018",
    "status": "pending",
    "id": "bk_test_123"
  }
}`}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
