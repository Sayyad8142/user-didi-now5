import React from 'react';
import { detectInstalledUpiApps, openUpiUrl, UpiApp } from '@/utils/upi';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  paymentParams: { pa: string; pn: string; am: string; tn: string; tr?: string };
  onNoneFound?: () => void;
};

export default function UpiChooser({ open, onOpenChange, paymentParams, onNoneFound }: Props) {
  const [loading, setLoading] = React.useState(true);
  const [apps, setApps] = React.useState<UpiApp[]>([]);

  React.useEffect(() => {
    let active = true;
    if (open) {
      setLoading(true);
      detectInstalledUpiApps().then(list => {
        if (!active) return;
        setApps(list);
        setLoading(false);
        if (list.length === 0 && onNoneFound) onNoneFound();
      });
    }
    return () => { active = false; };
  }, [open, onNoneFound]);

  const handlePick = async (app: UpiApp) => {
    const url = app.buildUrl(paymentParams);
    await openUpiUrl(url);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="space-y-4">
        <SheetHeader>
          <SheetTitle>Select a UPI app</SheetTitle>
        </SheetHeader>
        {loading ? (
          <div className="text-sm opacity-70">Looking for installed UPI apps…</div>
        ) : apps.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {apps.map(app => (
              <Button key={app.key} variant="secondary" className="h-12" onClick={() => handlePick(app)}>
                {app.label}
              </Button>
            ))}
          </div>
        ) : (
          <div className="text-sm opacity-70">No supported UPI apps found.</div>
        )}
      </SheetContent>
    </Sheet>
  );
}