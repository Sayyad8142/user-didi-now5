import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { X } from "lucide-react";

const CANCEL_REASONS = [
  "Worker taking too long",
  "Booked by mistake",
  "Change of plans",
  "Found alternative help",
  "Service not needed anymore",
  "Price is high",
] as const;

interface CancelBookingSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  loading?: boolean;
}

export default function CancelBookingSheet({
  open,
  onOpenChange,
  onConfirm,
  loading,
}: CancelBookingSheetProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [isOther, setIsOther] = useState(false);
  const [customReason, setCustomReason] = useState("");
  const [error, setError] = useState("");

  function reset() {
    setSelected(null);
    setIsOther(false);
    setCustomReason("");
    setError("");
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  function handleSelectChip(reason: string) {
    setSelected(reason);
    setIsOther(false);
    setCustomReason("");
    setError("");
  }

  function handleSelectOther() {
    setSelected(null);
    setIsOther(true);
    setError("");
  }

  const canConfirm = selected || (isOther && customReason.trim().length >= 5);

  function handleConfirm() {
    if (!canConfirm) {
      setError("Please select or enter a cancellation reason");
      return;
    }
    const reason = selected || customReason.trim();
    onConfirm(reason);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl px-5 pb-8 pt-4">
        <SheetHeader className="text-left mb-4">
          <SheetTitle className="text-lg font-bold">Cancel Booking</SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            Please tell us why you're cancelling. This helps us improve service.
          </SheetDescription>
        </SheetHeader>

        {/* Reason chips */}
        <div className="flex flex-wrap gap-2 mb-4">
          {CANCEL_REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              onClick={() => handleSelectChip(reason)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                selected === reason
                  ? "bg-[#ff007a] text-white border-[#ff007a]"
                  : "bg-muted text-foreground border-border hover:border-[#ff007a]/50"
              }`}
            >
              {reason}
            </button>
          ))}

          {/* Other chip */}
          <button
            type="button"
            onClick={handleSelectOther}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              isOther
                ? "bg-[#ff007a] text-white border-[#ff007a]"
                : "bg-muted text-foreground border-border hover:border-[#ff007a]/50"
            }`}
          >
            Other
          </button>
        </div>

        {/* Custom reason textarea */}
        {isOther && (
          <div className="mb-4">
            <Textarea
              placeholder="Type your cancellation reason..."
              value={customReason}
              onChange={(e) => {
                setCustomReason(e.target.value);
                setError("");
              }}
              className="min-h-[80px] text-sm"
              maxLength={500}
            />
            {isOther && customReason.trim().length > 0 && customReason.trim().length < 5 && (
              <p className="text-xs text-destructive mt-1">Minimum 5 characters required</p>
            )}
          </div>
        )}

        {error && <p className="text-xs text-destructive mb-3">{error}</p>}

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Button
            variant="destructive"
            disabled={!canConfirm || loading}
            onClick={handleConfirm}
            className="w-full bg-[#ff007a] hover:bg-[#e0006b]"
          >
            {loading ? (
              <>
                <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                Cancelling...
              </>
            ) : (
              <>
                <X className="h-4 w-4 mr-2" />
                Confirm Cancellation
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={loading}
            className="w-full"
          >
            Go Back
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
