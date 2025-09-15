import React from 'react';
import { UPI_APPS, detectInstalledUpiApps, tryOpen, UpiApp } from '@/utils/upi';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  paymentParams: { pa: string; pn: string; am: string; tn: string; tr?: string };
};

export default function UpiChooser({ open, onOpenChange, paymentParams }: Props) {
  const [loading, setLoading] = React.useState(true);
  const [apps, setApps] = React.useState<UpiApp[]>([]);
  const [forceMode, setForceMode] = React.useState(false); // show buttons even if detection fails

  React.useEffect(() => {
    let active = true;
    if (open) {
      setLoading(true);
      setForceMode(false);
      detectInstalledUpiApps().then(list => {
        if (!active) return;
        setApps(list);
        setLoading(false);
        if (list.length === 0) {
          // Fallback: still show the common apps so the user can attempt to open
          setForceMode(true);
        }
      });
    }
    return () => { active = false; };
  }, [open]);

  const handlePick = async (app: UpiApp) => {
    const url = app.buildUrl(paymentParams);
    const ok = await tryOpen(url);
    if (!ok) {
      toast.error(`${app.label} not available on this device`);
      // Offer App Store
      if (app.appStore) {
        toast.message(`Install ${app.label}?`, {
          action: {
            label: 'Open App Store',
            onClick: () => tryOpen(app.appStore!)
          }
        });
      }
      return;
    }
    onOpenChange(false);
  };

  const list = apps.length > 0 ? apps : (forceMode ? UPI_APPS : []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="space-y-4">
        <SheetHeader>
          <SheetTitle>{list.length > 0 ? 'Select a UPI app' : 'Looking for UPI apps…'}</SheetTitle>
        </SheetHeader>

        {loading && <div className="text-sm opacity-70">Scanning installed UPI apps…</div>}

        {!loading && list.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {list.map(app => (
              <Button key={app.key} variant="secondary" className="h-12" onClick={() => handlePick(app)}>
                {app.label}
              </Button>
            ))}
          </div>
        )}

        {!loading && list.length === 0 && (
          <div className="text-sm opacity-70">No UPI apps detected.</div>
        )}
      </SheetContent>
    </Sheet>
  );
}