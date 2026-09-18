import React, { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin } from 'lucide-react';
import { submitAreaRequest } from '@/lib/areaRequestApi';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Community search text the user already typed — pre-fills the field. */
  searchText?: string;
  /** Phone from the signup form, when available. */
  phone?: string;
}

export function RequestAreaSheet({ open, onOpenChange, searchText = '', phone }: Props) {
  const [value, setValue] = useState(searchText);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(searchText);
      setError('');
      setDone(false);
      setSubmitting(false);
    }
  }, [open, searchText]);

  const handleSubmit = async () => {
    const text = value.trim();
    if (!text) {
      setError('Please enter your community, area or PIN code');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await submitAreaRequest({ requestedArea: text, searchText, phone });
      setDone(true);
    } catch (e: any) {
      setError(e?.message || 'Could not save your request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl px-5 pb-8 pt-5">
        {done ? (
          <div className="text-center space-y-3 py-4">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-pink-100 flex items-center justify-center">
              <MapPin className="h-7 w-7 text-pink-500" />
            </div>
            <SheetHeader className="space-y-1">
              <SheetTitle className="text-lg font-bold text-gray-900">Request received! 🎉</SheetTitle>
            </SheetHeader>
            <p className="text-sm text-muted-foreground">
              Thanks! We've noted your area. We'll let you know when Didi Now becomes available near you.
            </p>
            <Button
              type="button"
              onClick={() => onOpenChange(false)}
              className="w-full h-12 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 text-white font-semibold shadow-md shadow-pink-500/20"
            >
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <SheetHeader className="space-y-1 text-left">
              <SheetTitle className="text-lg font-bold text-gray-900">
                Request Didi Now in Your Area
              </SheetTitle>
            </SheetHeader>
            <p className="text-sm text-muted-foreground -mt-2">
              Tell us where you'd like Didi Now to launch next.
            </p>

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">
                Community / Area / PIN Code
              </Label>
              <Input
                autoFocus
                value={value}
                onChange={e => {
                  setValue(e.target.value);
                  if (error) setError('');
                }}
                placeholder="e.g. My Home Bhooja, Kondapur, 500084"
                disabled={submitting}
                className="h-12 rounded-2xl border-gray-200 bg-white shadow-sm focus-visible:ring-2 focus-visible:ring-pink-200 focus-visible:border-pink-400"
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>

            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full h-12 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 text-white font-semibold shadow-md shadow-pink-500/20"
            >
              {submitting ? 'Submitting…' : 'Submit Request'}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
