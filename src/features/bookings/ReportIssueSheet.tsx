import React, { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, Flag, Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';

type IssueType =
  | 'assigned_worker_not_came'
  | 'different_person_came'
  | 'worker_unreachable'
  | 'worker_asked_extra_money'
  | 'other';

const OPTIONS: { value: IssueType; label: string }[] = [
  { value: 'assigned_worker_not_came', label: 'Assigned worker did not come' },
  { value: 'different_person_came', label: 'Different person came for service' },
  { value: 'worker_unreachable', label: 'Worker unreachable' },
  { value: 'worker_asked_extra_money', label: 'Worker asked extra money' },
  { value: 'other', label: 'Other' },
];

interface ReportIssueButtonProps {
  bookingId: string;
  workerId?: string | null;
  status: string;
  hasWorker: boolean;
  className?: string;
}

const ELIGIBLE_STATUSES = new Set(['assigned', 'accepted', 'on_the_way', 'started']);

/**
 * "Report Issue" button + bottom sheet.
 * Inserts a single complaint per booking into `booking_issues`.
 */
export function ReportIssueButton({
  bookingId,
  workerId,
  status,
  hasWorker,
  className,
}: ReportIssueButtonProps) {
  const { profile } = useProfile();
  const [open, setOpen] = useState(false);
  const [issueType, setIssueType] = useState<IssueType | ''>('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [alreadyReported, setAlreadyReported] = useState<boolean | null>(null);

  const isEligible = ELIGIBLE_STATUSES.has(status) && hasWorker;

  // Check if a complaint already exists for this booking (one per booking)
  useEffect(() => {
    if (!isEligible || !profile?.id) {
      setAlreadyReported(null);
      return;
    }
    let active = true;
    supabase
      .from('booking_issues' as any)
      .select('id', { head: true, count: 'exact' })
      .eq('booking_id', bookingId)
      .then(({ count, error }) => {
        if (!active) return;
        if (error) {
          // Table may not be deployed yet on this backend — fail open (allow reporting)
          console.warn('[ReportIssue] presence check failed:', error.message);
          setAlreadyReported(false);
          return;
        }
        setAlreadyReported((count ?? 0) > 0);
      });
    return () => {
      active = false;
    };
  }, [bookingId, isEligible, profile?.id]);

  const showSafetyWarning = issueType === 'different_person_came';

  const canSubmit = useMemo(() => {
    if (!issueType) return false;
    if (issueType === 'other' && description.trim().length === 0) return false;
    return !submitting;
  }, [issueType, description, submitting]);

  const handleSubmit = async () => {
    if (!canSubmit || !profile?.id) return;
    setSubmitting(true);
    try {
      const payload = {
        booking_id: bookingId,
        user_id: profile.id,
        worker_id: workerId ?? null,
        issue_type: issueType,
        issue_description:
          issueType === 'other'
            ? description.trim().slice(0, 200)
            : description.trim().length > 0
              ? description.trim().slice(0, 200)
              : null,
        status: 'open',
      };

      const { error } = await supabase.from('booking_issues' as any).insert(payload as any);

      if (error) {
        // Unique violation -> already reported
        const msg = String(error.message || '').toLowerCase();
        if (msg.includes('duplicate') || msg.includes('unique')) {
          setAlreadyReported(true);
          toast.info('You have already reported an issue for this booking.');
          setOpen(false);
          return;
        }
        throw error;
      }

      toast.success('Your complaint has been sent to admin. We will take action.');
      setAlreadyReported(true);
      setOpen(false);
      setIssueType('');
      setDescription('');
    } catch (err: any) {
      console.error('[ReportIssue] insert failed:', err);
      toast.error(err?.message || 'Could not send your complaint. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isEligible) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => !alreadyReported && setOpen(true)}
        disabled={!!alreadyReported}
        className={
          className ??
          `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ring-1 ${
            alreadyReported
              ? 'bg-muted text-muted-foreground ring-border cursor-default'
              : 'bg-rose-50 text-rose-700 ring-rose-200 hover:bg-rose-100'
          }`
        }
        aria-label={alreadyReported ? 'Issue already reported' : 'Report an issue'}
      >
        <Flag className="w-3.5 h-3.5" />
        {alreadyReported ? 'Issue Reported' : 'Report Issue'}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl px-6 pb-8 pt-6 max-h-[90vh] overflow-y-auto">
          <SheetHeader className="text-left">
            <div className="mb-2 p-2.5 rounded-2xl bg-rose-50 w-fit ring-1 ring-rose-200">
              <AlertTriangle className="w-5 h-5 text-rose-700" />
            </div>
            <SheetTitle>Report an Issue</SheetTitle>
            <SheetDescription>
              Tell us what's wrong. Our team will review and act on it.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-5">
            <RadioGroup
              value={issueType}
              onValueChange={(v) => setIssueType(v as IssueType)}
              className="gap-2"
            >
              {OPTIONS.map((opt) => (
                <Label
                  key={opt.value}
                  htmlFor={`issue-${opt.value}`}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    issueType === opt.value
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <RadioGroupItem id={`issue-${opt.value}`} value={opt.value} />
                  <span className="text-[14px] font-medium text-foreground">{opt.label}</span>
                </Label>
              ))}
            </RadioGroup>

            {showSafetyWarning && (
              <div className="mt-3 flex items-start gap-2 p-3 rounded-xl bg-amber-50 ring-1 ring-amber-200">
                <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <p className="text-[12px] text-amber-900 leading-snug">
                  For your safety, please do not allow unknown workers.
                </p>
              </div>
            )}

            {issueType === 'other' && (
              <div className="mt-3">
                <Label htmlFor="issue-desc" className="text-[12px] font-semibold text-muted-foreground">
                  Describe the issue
                </Label>
                <Textarea
                  id="issue-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 200))}
                  placeholder="Briefly describe what happened…"
                  maxLength={200}
                  rows={3}
                  className="mt-1.5"
                />
                <p className="mt-1 text-[11px] text-muted-foreground text-right">
                  {description.length}/200
                </p>
              </div>
            )}
          </div>

          <div className="mt-6 flex gap-2.5">
            <Button
              variant="outline"
              className="flex-1 h-11 rounded-xl"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Submitting…
                </>
              ) : (
                'Submit Complaint'
              )}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export default ReportIssueButton;
