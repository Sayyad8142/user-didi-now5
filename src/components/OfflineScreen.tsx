import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { WifiOff, Phone, RotateCcw } from 'lucide-react';

interface OfflineScreenProps {
  onRetry: () => void;
}

export function OfflineScreen({ onRetry }: OfflineScreenProps) {
  const handleCallSupport = () => {
    window.open('tel:+918008180018', '_self');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center space-y-6">
          <div className="flex justify-center">
            <WifiOff className="h-16 w-16 text-muted-foreground" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">You're offline</h2>
            <p className="text-muted-foreground">
              Please check your internet connection and try again.
            </p>
          </div>

          <div className="space-y-3">
            <Button onClick={onRetry} className="w-full" size="lg">
              <RotateCcw className="w-4 h-4 mr-2" />
              Retry Connection
            </Button>
            
            <Button 
              onClick={handleCallSupport} 
              variant="outline" 
              className="w-full"
              size="lg"
            >
              <Phone className="w-4 h-4 mr-2" />
              Call Support
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}