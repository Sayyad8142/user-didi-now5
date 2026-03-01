import React from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";

interface SupplyFullModalProps {
  open: boolean;
  onClose: () => void;
  onSchedule: () => void;
}

export function SupplyFullModal({ open, onClose, onSchedule }: SupplyFullModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xs rounded-3xl p-6 text-center shadow-xl border-0 gap-0">
        {/* Icon */}
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
          <Clock className="w-8 h-8 text-primary" />
        </div>

        {/* Title */}
        <h2 className="text-lg font-bold text-foreground mb-2">All Experts are Busy</h2>

        {/* Message */}
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          Our Experts are currently busy with other bookings. Please try again after some time.
        </p>

        {/* Buttons */}
        <div className="space-y-2">
          <Button onClick={onClose} className="w-full h-11 rounded-2xl font-bold">
            OK
          </Button>
          <Button
            variant="outline"
            onClick={onSchedule}
            className="w-full h-11 rounded-2xl font-semibold border-primary/20 text-primary hover:bg-primary/5"
          >
            Schedule Instead
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
